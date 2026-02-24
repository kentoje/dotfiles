export async function stagingAuth() {
  const email = "kento.monthubert+509@aircall.io";
  const password = Bun.env.STAGING_509_PASSWORD;
  if (!password) {
    return { content: [{ type: "text" as const, text: "Error: STAGING_509_PASSWORD not set" }] };
  }
  const res = await fetch("https://id.aircall-staging.com/auth/v1/users/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { content: [{ type: "text" as const, text: `Error: HTTP ${res.status} - ${text}` }] };
  }
  const data = await res.json();
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ accessToken: data.accessToken, refreshToken: data.refreshToken }) }],
  };
}
