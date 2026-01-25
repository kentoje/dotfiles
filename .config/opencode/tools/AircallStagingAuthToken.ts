import { tool } from "@opencode-ai/plugin";

export default tool({
  description:
    "Fetch a fresh JWT token from Aircall staging environment. Returns the accessToken and refreshToken for authentication with Aircall staging APIs.",
  args: {},
  async execute() {
    const email = "kento.monthubert+509@aircall.io";
    const password = Bun.env.STAGING_509_PASSWORD;

    if (!password) {
      return "Error: STAGING_509_PASSWORD environment variable is not set";
    }

    try {
      const response = await fetch(
        "https://id.aircall-staging.com/auth/v1/users/session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        return `Error: HTTP ${response.status} - ${text}`;
      }

      const res = await response.json();

      if (!res.accessToken) {
        return `Error: No accessToken in response. Response: ${JSON.stringify(res)}`;
      }

      return JSON.stringify({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      });
    } catch (error) {
      return `Error fetching token: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
