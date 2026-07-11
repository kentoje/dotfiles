const AUTH_URL = "https://id.aircall-staging.com/auth/v2/users/session";
const SESSION = "aircall-local";

async function runAgentBrowser(...args: string[]): Promise<string> {
  const proc = Bun.spawn(["agent-browser", "--session", SESSION, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`agent-browser failed (${exitCode}): ${stderr || stdout}`);
  }
  return stdout.trim();
}

export async function persistBrowserAuth({ url }: { url: string }) {
  try {
    const email = Bun.env.AIRCALL_EMAIL;
    if (!email) {
      throw new Error("AIRCALL_EMAIL not set");
    }

    const password = Bun.env.AIRCALL_PASSWORD;
    if (!password) {
      throw new Error("AIRCALL_PASSWORD not set");
    }

    // Fetch tokens
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    // v2 wraps tokens under the "basic" key on success. When the account
    // requires MFA, the endpoint instead returns HTTP 200 with an "mfa"
    // challenge payload (Cognito session + challengeName such as "EMAIL_OTP")
    // and no tokens. Other failures (invalid credentials, server errors)
    // arrive without tokens too. We treat *any* response lacking usable
    // tokens as a failure so the consumer is alerted rather than crashing on
    // an undefined "basic".
    const raw = await res.text();
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      data = undefined;
    }
    const accessToken: string | undefined = data?.basic?.accessToken;
    const refreshToken: string | undefined = data?.basic?.refreshToken;

    if (data?.mfa) {
      const { challengeName, email: mfaEmail } = data.mfa;
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: [
              `MFA challenge required for ${mfaEmail ?? email}${challengeName ? ` (${challengeName})` : ""}.`,
              `The account is protected by multi-factor auth, so this tool cannot auto-authenticate.`,
              `Complete the login manually (enter the one-time code), then retry - the device is usually trusted afterwards.`,
            ].join(" "),
          },
        ],
      };
    }

    if (!res.ok || !accessToken || !refreshToken) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: [
              `Auth did not return tokens (HTTP ${res.status}).`,
              `The credentials may be invalid or the endpoint returned an unexpected response.`,
              `Response: ${raw.slice(0, 500)}`,
            ].join(" "),
          },
        ],
      };
    }

    // Extract domain and security from target URL
    const parsed = new URL(url);
    const domain = parsed.hostname;
    const secure = parsed.protocol === "https:";

    // Set cookies directly via agent-browser CLI
    const cookieOpts = [
      "--url", url,
      "--domain", domain,
      "--sameSite", "Lax",
      ...(secure ? ["--secure"] : []),
    ];

    await Promise.all([
      runAgentBrowser("cookies", "set", "ac-auth.id-token", accessToken, ...cookieOpts),
      runAgentBrowser("cookies", "set", "ac-auth.refresh-token", refreshToken, ...cookieOpts),
    ]);

    return {
      content: [
        {
          type: "text" as const,
          text: `Cookies set on session "${SESSION}" for domain "${domain}". Navigate with: agent-browser --session ${SESSION} open "${url}"`,
        },
      ],
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${message}` }],
    };
  }
}
