import { HttpTransportError } from "../http/response-body.js";

const scanLimit = 16 * 1024 * 1024;

/** Read only the requested trace window and credential overlap, with a fixed scan limit. */
async function collectTrace(response: Response, start: number, end: number) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new HttpTransportError("LOG_UNAVAILABLE");
  }
  const slices: Uint8Array[] = [];
  let position = 0;
  try {
    while (position < end) {
      // oxlint-disable-next-line no-await-in-loop -- Each chunk advances the bounded trace stream.
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      const remaining = Math.min(chunk.value.byteLength, end - position);
      if (position + remaining > start) {
        slices.push(
          chunk.value.subarray(Math.max(0, start - position), remaining)
        );
      }
      position += remaining;
    }
    return Buffer.concat(slices);
  } finally {
    await reader.cancel().catch(() => {
      // The enclosing request scope also aborts this stream.
    });
    reader.releaseLock();
  }
}

/** Scan both edges of a trace window before masking credential bytes, including split matches. */
export async function readGitlabTraceWindow(
  response: Response,
  options: { offset: number; maxBytes: number; secrets: readonly string[] }
) {
  const { offset, maxBytes, secrets } = options;
  const overlap =
    Math.max(...secrets.map((secret) => Buffer.byteLength(secret)), 1) - 1;
  const start = Math.max(0, offset - overlap);
  const end = offset + maxBytes + overlap + 1;
  if (end > scanLimit) {
    throw new HttpTransportError("OUTPUT_LIMIT");
  }
  const bytes = await collectTrace(response, start, end);
  const masked = Buffer.from(bytes);
  const windowStart = offset - start;
  if (windowStart > bytes.length) {
    throw new HttpTransportError("INVALID_OFFSET");
  }
  let redacted = false;
  for (const secret of secrets) {
    const pattern = Buffer.from(secret);
    let found = bytes.indexOf(pattern);
    let maskedThrough = 0;
    while (found !== -1) {
      const endOfMatch = found + pattern.length;
      masked.fill(42, Math.max(found, maskedThrough), endOfMatch);
      maskedThrough = endOfMatch;
      redacted ||=
        found < windowStart + maxBytes && found + pattern.length > windowStart;
      found = bytes.indexOf(pattern, found + 1);
    }
  }
  const available = Math.min(maxBytes, bytes.length - windowStart);
  const consumed = available;
  let text: string;
  let decode_warning = false;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      masked.subarray(windowStart, windowStart + consumed)
    );
  } catch {
    decode_warning = true;
    text = masked
      .subarray(windowStart, windowStart + consumed)
      .toString("utf-8");
    // Replacement decoding may expand a byte to three UTF-8 bytes. ASCII fallback
    // retains one byte of output per source byte even for one-byte windows.
    if (Buffer.byteLength(text) > maxBytes) {
      const ascii = masked
        .subarray(windowStart, windowStart + consumed)
        .map((byte) => (byte > 127 ? 63 : byte));
      text = Buffer.from(ascii).toString("utf-8");
    }
  }
  const has_more = bytes.length > windowStart + consumed;
  return {
    decode_warning,
    has_more,
    next_offset: has_more ? offset + consumed : null,
    offset,
    redacted,
    returned_bytes: Buffer.byteLength(text),
    source_bytes: consumed,
    text,
    truncated: has_more,
  };
}
