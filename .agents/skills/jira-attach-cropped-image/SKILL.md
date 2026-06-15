---
name: jira-attach-cropped-image
description: >
  Attach images to a Jira issue (Jira Cloud / aircall-product.atlassian.net), optionally
  cropped to just a UI component instead of a full-page screenshot. Use whenever asked to
  "add a screenshot/image to a Jira ticket", "attach the current component to the ticket",
  or to put a component image in a ticket description. Covers the REST upload (the MCP/CLI
  can't attach), why inline-in-description embedding is impossible, and how to crop.
---

# Attach (cropped) images to Jira tickets

## Key facts (learned the hard way)

- **The Atlassian MCP tools and `jira` CLI cannot upload attachments.** Use the Jira REST
  attachment API directly (`POST /rest/api/3/issue/{KEY}/attachments`).
- **You cannot embed an image *inline in the description body* via the API.** Jira Cloud's
  ADF `media` node needs an internal media-services UUID; the attachment id returned by REST
  is *not* it — every variant returns `ATTACHMENT_VALIDATION_ERROR` (HTTP 400). So: **attach
  the image** (it shows in the issue's Attachments panel) and **reference it from the
  description text** (e.g. end the description with `_… — see attached screenshot._`).
- **`curl` is often blocked by a PreToolUse hook in `Bash`** (context-mode intercepts it).
  Run the curl commands via the **context-mode `ctx_execute(language:"shell", …)`** tool
  instead (it has network access and the env vars propagate), or the bundled script through it.

## Auth

Reads the same credentials as the `jira` CLI:
- Email: `login:` field in `~/.config/.jira/.config.yml`
- Token: `$JIRA_API_TOKEN` env var (basic auth: `email:token`)
- Server: `https://aircall-product.atlassian.net`

Verify first: `GET /rest/api/3/myself` should return your account.

## Step 1 — produce a CROPPED image of just the component

Two ways. Prefer (A) when the component is rendered in a running app you can drive with
`agent-browser`.

**(A) `agent-browser` element screenshot — cleanest.** Scroll the element into view, then
screenshot **by selector**. The selector value **MUST be quoted** or it silently fails /
falls back to full page:

```bash
agent-browser --session <s> eval "document.querySelector('[data-test=\"number-section\"]')?.scrollIntoView({block:'center'}); 'ok'"
agent-browser --session <s> screenshot '[data-test="number-section"]' /tmp/crop.png   # NOTE the quotes inside []
```

This writes a tight crop (just the element). Verify size with `sips -g pixelWidth -g pixelHeight /tmp/crop.png`.
(For the Aircall assets/dashboard apps, sections expose `data-test="…-section"` / `…-card` ids.)

**(B) Crop an existing full screenshot with ImageMagick.** Get the element box + device
pixel ratio from the page, then crop:

```bash
# in the browser: JSON.stringify({...el.getBoundingClientRect().toJSON(), dpr: devicePixelRatio})
magick full.png -crop ${W}x${H}+${X}+${Y} +repage /tmp/crop.png   # multiply x/y/w/h by dpr if dpr>1
```

## Step 2 — attach to the issue (and optionally replace an old attachment)

Use the bundled script (run it **via ctx_execute** if curl is hook-blocked):

```bash
scripts/jira-attach.sh DS-22 /tmp/crop.png                 # attach one or more files
scripts/jira-attach.sh --replace 475336 DS-22 /tmp/crop.png # delete attachment 475336 first, then attach
```

It prints each new attachment id. Equivalent raw call:

```bash
curl -s -u "$EMAIL:$JIRA_API_TOKEN" -H "X-Atlassian-Token: no-check" \
  -F "file=@/tmp/crop.png" "https://aircall-product.atlassian.net/rest/api/3/issue/DS-22/attachments"
# replace: DELETE /rest/api/3/attachment/{id}  (returns 204)
```

## Step 3 — reference it in the description

When creating/editing the issue (MCP `createJiraIssue` / `editJiraIssue` with markdown is fine),
end the relevant section with a line like:

> _Current component — see attached screenshot._

Do **not** attempt an ADF `media` node pointing at the attachment id — it will 400.

## Gotchas
- Element screenshot selector must be quoted: `'[data-test="x"]'`, not `[data-test=x]`.
- Deleting an *issue* may be 403 (no permission); deleting an *attachment* you created is usually allowed (204).
- Aircall dev app screenshots are DPR=1 (1280-wide viewport) — box coords map 1:1 to pixels.
