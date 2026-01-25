---
name: agent-browser-aircall-local
description: Open a headless browser authenticated with Aircall staging credentials for localhost development
---

# Agent Browser - Aircall Local Development

Opens an `agent-browser` instance authenticated with Aircall staging credentials for localhost development.

> **Note:** `agent-browser` is only available in fish shell. Use `fish -c "agent-browser ..."` to run commands.

## Help

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes

## Usage

Use this skill when you need to browse a localhost app (`http://localhost:<PORT>`) authenticated against the Aircall staging environment.

**User provides:**

- `PORT` - The localhost port (e.g., `3000`, `5173`)
- `TARGET_PATH` - The path to navigate to after auth (e.g., `/playground`, `/...`)

## Steps to Execute

### 1. Retrieve Fresh Staging Token

Use the `AircallStagingAuthToken` tool to get a fresh JWT token:

```
Call the AircallStagingAuthToken tool
```

The tool returns the access token needed for authentication.

### 2. Navigate to SSO with Token

Use `agent-browser` to navigate directly to the SSO URL, bypassing normal auth redirects:

```bash
agent-browser --session aircall-local open "http://localhost:<PORT>/sso/callback?token=<TOKEN>&refresh_token=<REFRESH_TOKEN>&redirect=<TARGET_PATH>"
```

**Parameters:**

- `<PORT>` - User-provided localhost port
- `<TOKEN>` - The token from step 1
- `<TARGET_PATH>` - User-provided target path (URL-encoded if needed)

The app reads the token from query params, stores it, and redirects to the target page authenticated.

### 3. Take Snapshot of Page

After navigation completes, get an interactive snapshot to see the page state:

```bash
agent-browser --session aircall-local snapshot -i
```

This returns interactive elements with refs (`@e1`, `@e2`, etc.) for further interaction.

### 4. Interact with Page Elements

Use the refs from the snapshot to interact:

```bash
# Click an element
agent-browser --session aircall-local click @e1

# Fill a text field
agent-browser --session aircall-local fill @e2 "some text"

# Take screenshot
agent-browser --session aircall-local screenshot /tmp/screenshot.png
```

**Always re-snapshot after page changes** to get updated refs:

```bash
agent-browser --session aircall-local snapshot -i
```

## Complete Example Flow

```bash
# 1. Get token (via AircallStagingAuthToken tool - returns token string)

# 2. Open browser with auth
agent-browser --session aircall-local open "http://localhost:3000/sso?token=eyJhbG...&redirect=/playground"

# 3. Get interactive snapshot
agent-browser --session aircall-local snapshot -i

# 4. Interact based on snapshot refs
agent-browser --session aircall-local click @e5
agent-browser --session aircall-local snapshot -i  # Re-snapshot after click

# 5. Fill form fields
agent-browser --session aircall-local fill @e3 "test input"

# 6. Take screenshot for verification
agent-browser --session aircall-local screenshot /tmp/result.png
```

## Session Management

| Command                                       | Description                  |
| --------------------------------------------- | ---------------------------- |
| `--session aircall-local`                     | Use isolated browser context |
| `agent-browser --session aircall-local close` | Close browser session        |
| `agent-browser sessions`                      | List active sessions         |

## Browser Modes

- **Headless** (default): No visible browser window
- **Headed**: Add `--headed` flag to see the browser

```bash
agent-browser --session aircall-local --headed open "http://localhost:3000/sso?token=..."
```

## Troubleshooting

### Token Expired

Re-run the `AircallStagingAuthToken` tool to get a fresh token.

### Page Not Loading

1. Verify the localhost server is running on the specified port
2. Check the snapshot for any error messages
3. Take a screenshot: `agent-browser --session aircall-local screenshot /tmp/debug.png`

### Element Not Found

1. Re-snapshot to get current page state
2. Use `snapshot -i -c` for more compact output
3. Verify the element exists in the snapshot before interacting

## Technical Details

- **SSO Route**: `/sso` (bypasses normal auth redirect flow)
- **Query Params**: `token`, `redirect`
- **Session Name**: `aircall-local`
- **Auth Endpoint**: `https://id.aircall-staging.com/auth/v1/users/session`
