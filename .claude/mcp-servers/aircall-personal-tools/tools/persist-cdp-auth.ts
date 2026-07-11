const AUTH_URL = "https://id.aircall-staging.com/auth/v2/users/session";
const EMAIL = "kento.monthubert+509@aircall.io";

export async function persistCdpAuth({ url }: { url: string }) {
  try {
    const password = Bun.env.STAGING_509_PASSWORD;
    if (!password) {
      throw new Error("STAGING_509_PASSWORD not set");
    }

    // Fetch tokens
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} - ${text}`);
    }
    const data = await res.json();
    // v2 wraps tokens under the "basic" key
    const { accessToken, refreshToken } = data.basic;

    // Extract domain and security from target URL
    const parsed = new URL(url);
    const domain = parsed.hostname;
    const secure = parsed.protocol === "https:";
    const securePart = secure ? " Secure;" : "";

    // Build initScript that sets cookies before any page scripts run.
    // This avoids the SSO redirect problem: cookies are present when the
    // app's auth check executes, so no redirect occurs.
    const initScript = [
      `document.cookie = "ac-auth.id-token=${accessToken}; domain=${domain}; path=/; SameSite=Lax;${securePart}";`,
      `document.cookie = "ac-auth.refresh-token=${refreshToken}; domain=${domain}; path=/; SameSite=Lax;${securePart}";`,
    ].join("\n");

    return {
      content: [
        {
          type: "text" as const,
          text: [
            `Auth tokens fetched for domain "${domain}". Navigate with initScript to set cookies before page scripts run:`,
            "",
            "Use `navigate_page` with these parameters:",
            `  url: "${url}"`,
            `  type: "url"`,
            `  initScript: ${JSON.stringify(initScript)}`,
          ].join("\n"),
        },
      ],
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      content: [{ type: "text" as const, text: `Error: ${message}` }],
    };
  }
}
