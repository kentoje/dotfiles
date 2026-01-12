---
name: staging-browser
description: Open a dev-browser instance authenticated with Aircall staging credentials
---

# Staging Browser

Opens a dev-browser instance authenticated with staging credentials.

## Usage

Use this skill when you need to open a browser authenticated against the Aircall staging environment.

**IMPORTANT**: If no URL is provided as an argument, ask the user what URL they want to navigate to before proceeding.

## Steps to Execute

### 1. Get Token and Start Server

Run these in parallel:

```bash
# Get the staging JWT token
ID_TOKEN=$(fish -c "source /Volumes/HomeX/kento/dotfiles/.config/fish/functions/get_token.fish && get_token" 2>&1 | grep -o '{.*}' | jq -r '.idToken')
echo "Token: ${ID_TOKEN:0:20}..."
```

```bash
# Check if dev-browser is already running - DO NOT kill existing processes
if lsof -i:9222 > /dev/null 2>&1; then
  echo "dev-browser already running on port 9222, reusing existing instance"
else
  echo "Starting dev-browser server..."
  cd /Volumes/HomeX/kento/.claude/plugins/cache/dev-browser-marketplace/dev-browser/66682fb0513a/skills/dev-browser && ./server.sh &
  sleep 3
fi
```

### 2. Set Cookie and Navigate

Replace `$ID_TOKEN` and `$TARGET_URL` with actual values:

```bash
cd /Volumes/HomeX/kento/.claude/plugins/cache/dev-browser-marketplace/dev-browser/66682fb0513a/skills/dev-browser && npx tsx <<EOF
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("staging-dashboard", { viewport: { width: 1920, height: 1080 } });

await page.context().addCookies([{
  name: "ac-auth.id-token",
  value: "$ID_TOKEN",
  domain: "localhost",
  path: "/",
}]);

await page.goto("$TARGET_URL");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

### 3. Verify (Optional)

Take a screenshot only if needed to debug:

```bash
cd /Volumes/HomeX/kento/.claude/plugins/cache/dev-browser-marketplace/dev-browser/66682fb0513a/skills/dev-browser && npx tsx <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("staging-dashboard");
await page.screenshot({ path: "tmp/staging-screenshot.png" });
await client.disconnect();
EOF
```

## Arguments

- **URL** (optional): The URL to navigate to. If not provided, ask the user.

## Technical Details

- **Cookie Name**: `ac-auth.id-token`
- **Cookie Domain**: `localhost`
- **Page Name**: `staging-dashboard`
- **Viewport**: 1920x1080
