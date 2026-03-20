const AUTH_URL = "https://id.aircall-staging.com/auth/v1/users/session";
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
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} - ${text}`);
    }
    const data = await res.json();

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
      runAgentBrowser("cookies", "set", "ac-auth.id-token", data.accessToken, ...cookieOpts),
      runAgentBrowser("cookies", "set", "ac-auth.refresh-token", data.refreshToken, ...cookieOpts),
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
