import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export default tool({
  description:
    "Set up and start ngrok development environment for Aircall. Creates ngrok config, starts dev server and ngrok tunnel, retrieves staging tokens, and outputs the full SSO callback URL.",
  args: {
    projectPath: tool.schema
      .string()
      .describe("Path to the project directory containing rsbuild.config.ts"),
    port: tool.schema
      .number()
      .describe("Port the dev server runs on. Check the project's rsbuild config or package.json to find the correct port."),
  },
  async execute(args) {
    const { projectPath, port } = args;
    const results: string[] = [];

    // 1. Check if ngrok is installed
    try {
      const ngrokCheck = Bun.spawnSync(["which", "ngrok"]);
      if (ngrokCheck.exitCode !== 0) {
        return "Error: ngrok is not installed. Please install it with: brew install ngrok";
      }
      results.push("[OK] ngrok is installed");
    } catch {
      return "Error: Failed to check ngrok installation";
    }

    // 2. Check if rsbuild.config.ts exists
    const rsbuildConfigPath = join(projectPath, "rsbuild.config.ts");
    if (!existsSync(rsbuildConfigPath)) {
      return `Error: rsbuild.config.ts not found at ${rsbuildConfigPath}. Make sure you're in a project using rsbuild.`;
    }
    results.push("[OK] rsbuild.config.ts found");

    // 3. Get NGROK_ENDPOINT_1 environment variable and strip any protocol prefix
    let ngrokEndpoint = Bun.env.NGROK_ENDPOINT_1;
    if (!ngrokEndpoint) {
      return "Error: NGROK_ENDPOINT_1 environment variable is not set. Please set it to your ngrok static domain.";
    }
    // Strip protocol prefix if present (https://, http://, https//, etc.)
    ngrokEndpoint = ngrokEndpoint.replace(/^https?:?\/\//, "");
    results.push(`[OK] NGROK_ENDPOINT_1: ${ngrokEndpoint}`);

    // 4. Create rsbuild.config.ngrok.ts as a wrapper that extends the original config
    const ngrokConfigPath = join(projectPath, "rsbuild.config.ngrok.ts");
    try {
      const ngrokConfig = `import baseConfig from "./rsbuild.config";
import { mergeRsbuildConfig } from "@rsbuild/core";

export default mergeRsbuildConfig(baseConfig, {
  dev: {
    assetPrefix: "https://${ngrokEndpoint}",
  },
});
`;
      writeFileSync(ngrokConfigPath, ngrokConfig, "utf-8");
      results.push(`[OK] Created rsbuild.config.ngrok.ts`);
    } catch (error) {
      return `Error: Failed to create ngrok config: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 5. Retrieve staging token and refresh token
    const email = "kento.monthubert+509@aircall.io";
    const password = Bun.env.STAGING_509_PASSWORD;

    if (!password) {
      return "Error: STAGING_509_PASSWORD environment variable is not set";
    }

    let accessToken: string;
    let refreshToken: string;

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
        return `Error: Failed to get staging token: HTTP ${response.status} - ${text}`;
      }

      const res = await response.json();

      if (!res.accessToken) {
        return `Error: No accessToken in response. Response: ${JSON.stringify(res)}`;
      }

      accessToken = res.accessToken;
      refreshToken = res.refreshToken;
      results.push("[OK] Retrieved staging tokens");
    } catch (error) {
      return `Error fetching token: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 6. Check if pnpm or yarn
    const hasPnpmLock = existsSync(join(projectPath, "pnpm-lock.yaml"));
    const hasYarnLock = existsSync(join(projectPath, "yarn.lock"));
    const packageManager = hasPnpmLock ? "pnpm" : hasYarnLock ? "yarn" : "npm";
    results.push(`[OK] Package manager: ${packageManager}`);

    // 7. Start the dev server in background
    try {
      Bun.spawn([packageManager, "dev", "--config", "rsbuild.config.ngrok.ts"], {
        cwd: projectPath,
        stdio: ["ignore", "ignore", "ignore"],
      });
      results.push(`[OK] Started dev server: ${packageManager} dev --config rsbuild.config.ngrok.ts`);
    } catch (error) {
      return `Error: Failed to start dev server: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 8. Start ngrok tunnel in background
    try {
      Bun.spawn(["ngrok", "http", String(port), `--domain=${ngrokEndpoint}`], {
        stdio: ["ignore", "ignore", "ignore"],
      });
      results.push(`[OK] Started ngrok tunnel: ngrok http ${port} --domain=${ngrokEndpoint}`);
    } catch (error) {
      return `Error: Failed to start ngrok: ${error instanceof Error ? error.message : String(error)}`;
    }

    // 9. Build the SSO callback URL
    const ssoCallbackUrl = `https://${ngrokEndpoint}/sso/callback?token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;

    // 10. Copy URL to clipboard (macOS)
    let clipboardStatus = "";
    try {
      const pbcopy = Bun.spawn(["pbcopy"], {
        stdin: "pipe",
      });
      pbcopy.stdin.write(ssoCallbackUrl);
      pbcopy.stdin.end();
      clipboardStatus = "[OK] SSO URL copied to clipboard";
    } catch {
      clipboardStatus = "[WARN] Could not copy to clipboard";
    }

    // Output summary
    const output = [
      "=== NGROK DEV SETUP ===",
      "",
      results.join("\n"),
      "",
      "=== SERVERS RUNNING ===",
      `Dev server: http://localhost:${port}`,
      `Ngrok tunnel: https://${ngrokEndpoint}`,
      "",
      clipboardStatus,
      "",
      "Paste the URL in your browser (Cmd+V)",
    ].join("\n");

    return output;
  },
});
