/** Transport limits are errors, not permission to decode a truncated JSON prefix. */
export class HttpTransportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "HttpTransportError";
  }
}
/** Read complete decompressed response bytes under the host cap, cancelling the owned stream on every exit. */
export async function readBoundedJsonBody(
  response: Response,
  maxBytes: number
): Promise<unknown> {
  const advertised = response.headers.get("content-length");
  if (
    advertised &&
    /^\d+$/u.test(advertised) &&
    Number(advertised) > maxBytes
  ) {
    await response.body?.cancel();
    throw new HttpTransportError("OUTPUT_LIMIT");
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new HttpTransportError("MALFORMED_RESPONSE");
  }
  let count = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Streaming enforces the byte cap before reading the next chunk.
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      count += chunk.value.byteLength;
      if (count > maxBytes) {
        throw new HttpTransportError("OUTPUT_LIMIT");
      }
      chunks.push(chunk.value);
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks, count)
      );
      const value: unknown = JSON.parse(text);
      return value;
    } catch {
      throw new HttpTransportError("MALFORMED_RESPONSE");
    }
  } catch (error) {
    if (error instanceof HttpTransportError) {
      throw error;
    }
    throw new HttpTransportError("MALFORMED_RESPONSE");
  } finally {
    await reader.cancel().catch(() => {
      // Preserve the original decoding error; the invocation scope also aborts this owned request.
    });
    reader.releaseLock();
  }
}
function redactString(value: string, secrets: readonly string[]) {
  const slash = String.fromCodePoint(92);
  const special = `${slash}^$.*+?()[]{}|`;
  const pattern = secrets
    .map((secret) =>
      [...secret]
        .map((character) =>
          special.includes(character) ? slash + character : character
        )
        .join("")
    )
    .join("|");
  return value.replaceAll(new RegExp(pattern, "gu"), "[REDACTED]");
}
/** Sanitize decoded string values and keys before unknown service JSON crosses the feature boundary. */
export function redactHttpJson(
  value: unknown,
  secrets: readonly string[],
  depth = 0
): unknown {
  if (depth > 64) {
    throw new HttpTransportError("OUTPUT_LIMIT");
  }
  if (typeof value === "string") {
    return redactString(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) =>
      redactHttpJson(item, secrets, depth + 1)
    );
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        redactString(key, secrets),
        redactHttpJson(item, secrets, depth + 1),
      ])
    );
  }
  return value;
}
