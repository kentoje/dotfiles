---
name: remote-boxd-machine
description: |
  Create and use Kento's boxd dev machines from the aircall-dev snapshot, and attach them in Herdr.
  Use when the user says boxd machine, setup-machine, aircall-dev, spin up a dev machine, snapshot a machine, or wants a boxd SSH session in Herdr.
---

# boxd machine

Kento's reusable dev image. The external CLI is `boxd` on the laptop. Command syntax is `boxd <cmd> --help`. Behavior for the generic CLI lives in the `remote-boxd-cli` skill. This skill is the local workflow.

Agents pass every argument and use `--json`. No prompts.

The coding agent runs on the machine, not on the laptop. The laptop creates the machine, forwards the user's prompt to `pi` or `omp` there, and provides the two things the machine cannot reach on its own: the staging identity API (through a tunnel) and the GraphQL schema. Do not implement the ticket from a laptop agent by copying files back and forth.

## Image

Snapshot name: `aircall-dev`. Saved from whichever machine was last prepared (`boxd snapshots list` shows only the version, not the source).

A machine from it already has projects at `~/Documents/gitlab/aircall/<group>/<repo>` (default branches, no `sre/secrets`) and dotfiles at `~/dotfiles`. Only `~/.agents` and `~/.pi/agent` are linked. Do not stow. Fish and nix are Mac-only.

`conversation-center-ext` already has `node_modules` and Playwright's Chromium in `~/.cache/ms-playwright`. Other repos still need `pnpm install`. `portless` is installed and its HTTPS proxy is on port 443.

Secrets are not in the snapshot. Boxd injects `GITLAB_TOKEN`, `GEMFURY_AUTH`, `CI_JOB_TOKEN`, `JIRA_API_TOKEN`, and the other private env vars into exec and login shells. GitLab clones use a credential helper that reads `GITLAB_TOKEN` at runtime. Never write tokens into `~/.gitconfig` or `~/.npmrc`.

## New machine

```bash
boxd machine new <name> --from-snapshot aircall-dev --json
boxd machine get <name> --json
```

Poll `get` until `status` is `running`. SSH is `ssh <name>.boxd` once boxd has refreshed `~/.ssh/config` (`boxd machine list` does that).

Run commands with `boxd machine exec <name> -- 'bash -lc "..."'`. The default remote shell is `sh`, and boxd wraps the command in `eval`. Do not pass `${...}`, `${!name}`, or other expansions the local shell or that `eval` will eat. Write a script and run the file if the command needs those.

Login-shell tools (`fnm`, `pi`, `herdr`, `portless`) need `bash -lc` or an interactive shell. `node` and `pnpm` come from `~/.local/share/fnm/aliases/default/bin`, which `~/.bashrc` puts on `PATH` before its non-interactive `return`. Plain `ssh <name>.boxd 'cmd'` runs `sh` without those files, so wrap commands in `bash -lc` there too.

## Run the agent on the machine

Create one machine per task. Do not reuse `setup-machine`.

```bash
boxd machine new <name> --from-snapshot aircall-dev --json
```

Open the staging identity tunnel (see Staging login) and, for `conversation-center-ext`, forward the schema before starting the agent. Then send the user's prompt. `pi` and `omp` are on the image. `~/.omp/agent` is linked to the dotfiles config, so llmgateway is already configured. `LLM_GATEWAY_KEY` is injected. Redirect stdin so the agent does not wait on it.

```bash
boxd machine exec <name> -- 'bash -lc "cd <worktree> && pi -p --mode json < /tmp/prompt.md"'
boxd machine exec <name> -- 'bash -lc "cd <worktree> && omp -p < /tmp/prompt.md"'
```

Write the prompt to `/tmp/prompt.md` on the machine with `boxd machine cp`. Do not inline it in the exec command. `machine exec` is `sh` and wraps the command in `eval`.

The laptop does not edit the checkout. `boxd machine cp` is only for the prompt and the schema. The remote agent edits files, runs tests, starts the dev server, and drives `agent-browser` on the machine.

Follow-ups use the same remote session. Capture the session id from the first `pi` JSON result and pass `--resume <id>`. Do not start a second laptop agent to interpret the remote output and then copy a fix back.

## Working on a ticket

`conversation-center-ext` worktrees go through `scripts/new-worktree.sh`. It installs deps from the shared pnpm store (seconds, not a fresh download) and assigns a `PORT` in 20000-29999. Do not symlink `node_modules`. pnpm rejects a modules dir outside the project root. Do not assume port 3002 is free on the Mac.

A dev server must outlive `machine exec`. `nohup cmd &` dies with the session. Detach it:

```bash
boxd machine exec <name> -- 'bash -lc "cd <repo> && setsid pnpm dev:mock > /tmp/dev.log 2>&1 < /dev/null &"'
```

Then `portless alias <app> <port>` on the machine. Drive the browser there (`agent-browser`, or `pnpm exec playwright`). Do not tunnel the app back to a Mac portless URL.

## Staging login

`id.aircall-staging.com` answers every request from a boxd machine with 403 `ForbiddenException`. Boxd machines share the egress IP `67.213.121.191` (Latitude.sh, Frankfurt), not the machine's public IP. The API Gateway in front of the identity API rejects that source before the auth app runs. From the Mac, the same request reaches the app. Every other staging host (`dashboard`, `internal`, `internal-api`, `cdn`, the AppSync APIs) answers the machine the same way it answers the Mac. Only the identity API is blocked. That covers both login (`POST /auth/v2/users/session`) and token refresh (`GET /auth/v1/tokens/refresh`).

Route the identity API through the laptop with a reverse SSH tunnel. Run on the laptop:

```bash
~/.agents/skills/remote-boxd-machine/scripts/staging-identity-tunnel.sh start <name>
```

It ends with `staging identity tunnel open: ... (probe HTTP 400)`. 400 is `'email' is required` from the auth app, so the request got past the gateway. Then everything on the machine logs in with no token handling:

- `pnpm dev` in `conversation-center-ext`: `build/dev-auth.ts` logs in with the injected `AIRCALL_STAGING_EMAIL` / `AIRCALL_STAGING_PASSWORD` on the first page load and sets the `ac-auth.*` cookies on the portless host.
- The app in the machine's browser refreshes its own token through the tunnel, so the session survives past the 1-hour token expiry.
- Playwright e2e auth (`e2e/utilities/setup/authenticate.ts`) calls the same login endpoint from Node, so it goes through the tunnel too. Not yet verified with a full e2e run.

What the script does:

- The machine resolves `id.aircall-staging.com` to `127.0.0.2` through an `/etc/hosts` line tagged `# boxd-staging-identity-tunnel`. It uses `127.0.0.2` because portless already holds `127.0.0.1:443`.
- A reverse forward from the laptop listens on `127.0.0.2:443` on the machine and connects to `id.aircall-staging.com:443` from the laptop's network.
- TLS stays end to end between the machine and AWS. The tunnel carries encrypted bytes, and the laptop never sees the password or the tokens.

Boxd's SSH gateway accepts `ssh -R` and reports success, but never opens the port inside the machine. Plain `ssh -R ... <name>.boxd` does not work. The script instead runs the machine's own OpenSSH in inetd mode (`sshd -i`) over the gateway connection, with a private config under `~/.local/state/boxd-staging-identity-tunnel`. That sshd allows only this one forward, and it lives exactly as long as the laptop's `ssh` process. Nothing is installed as a service.

The tunnel lives as long as the laptop is awake and online. A closed lid or lost network means 000 on the machine instead of 403. Check with `status`, and run `start` again to reopen. `start` is idempotent.

```bash
~/.agents/skills/remote-boxd-machine/scripts/staging-identity-tunnel.sh status <name>   # 400 = through laptop, 403 = blocked egress, 000 = tunnel down
~/.agents/skills/remote-boxd-machine/scripts/staging-identity-tunnel.sh stop <name>
```

Run `stop` before `boxd machine remove`, and always before `boxd snapshots save`. A snapshot captures running processes and `/etc/hosts`, so a save taken while the tunnel is open bakes a dead tunnel into every machine made from it. `start` kills a leftover tunnel sshd, but keep the snapshot clean anyway. If the machine is already gone, `stop` still closes the laptop side.

If login returns 401 through the tunnel, the credentials are wrong, not the network. `boxd env set` stores a value exactly as given. A password with `\` typed into a shell can gain an escape character, so set it from the Mac's variable: `boxd env set AIRCALL_STAGING_PASSWORD "$AIRCALL_STAGING_PASSWORD" --secret`.

The machine's browser does not trust the portless CA. Open the app with `agent-browser --ignore-https-errors open https://<app>.localhost/`.

Do not copy tokens or the password onto the machine or into the snapshot. Credentials come only from the boxd-injected env vars.

Use `pnpm dev`, not `pnpm dev:mock`, when the proof needs real staging data. MSW is still the right path when fixtures are enough.

## GraphQL schema

`pnpm graphql:download` runs `aws appsync get-introspection-schema` using `AWS_APP_ID` and `AWS_REGION` from `.env.local`. The machine has no AWS CLI and no AWS credentials. Do not run the download there, and do not copy `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN` onto it.

`src/graphql/schema.graphql` and `src/graphql-env.d.ts` are committed, so a fresh worktree is already typed. Only refresh them when a change needs fields newer than the committed schema. The laptop downloads the schema, then forwards the file.

```bash
cd ~/Documents/gitlab/dashboard-extensions/conversation-center-ext
aws sso login --profile aircall-workspace-staging   # only if the session is expired
set -a && source .env.local && set +a
aws appsync get-introspection-schema --api-id "$AWS_APP_ID" --region "$AWS_REGION" --format SDL --no-include-directives /tmp/schema.graphql
printf '\n' >> /tmp/schema.graphql
cat src/graphql/scalars.graphql >> /tmp/schema.graphql
boxd machine cp /tmp/schema.graphql <name>:<worktree>/src/graphql/schema.graphql
rm -f /tmp/schema.graphql
```

Then on the machine, in that worktree: `pnpm gql-tada generate-output`. That writes `src/graphql-env.d.ts`. Commit both only with the change that needs the newer schema, as the team does, and do not bake a refreshed schema into the snapshot.

Install deps for any repo other than `conversation-center-ext` on the machine you work in:

```bash
boxd machine exec <name> -- 'bash -lc "cd ~/Documents/gitlab/aircall/shared/hydra && pnpm install"'
```

## Herdr

Do not fake a machine with a local pane running `ssh`. Herdr has saved SSH machines.

```bash
herdr machine add <name>.boxd --label <name>
```

`machine add` is interactive and may install or replace the remote Herdr server. Do not answer that prompt unless the user is there to approve it. The snapshot already has `~/.local/bin/herdr` 0.9.3, so add should only need to start the server.

Selecting the machine in the Herdr sidebar shows that machine's sessions. CLI commands in a local pane still hit the local server. To inspect the remote, run herdr on the host:

```bash
ssh -o BatchMode=yes <name>.boxd '"$HOME/.local/bin/herdr" workspace list'
```

Pin `~/.local/bin/herdr`. A bare `herdr` on the remote may be an older packaged binary.

The sidebar profile lives on the Mac, not in the snapshot. Each new machine needs its own `herdr machine add`.

## Snapshots

```bash
boxd snapshots list --json
boxd snapshots save setup-machine aircall-dev --json
boxd machine new <name> --from-snapshot aircall-dev --json
boxd snapshots remove aircall-dev --confirm
```

`snap` is the alias for `snapshots`. Re-saving `aircall-dev` creates a new version; latest wins. `remove` deletes every version and needs `--confirm` in scripts.

Create a machine from the snapshot, change it, then save that machine. Before saving:

- Check `boxd snapshots list --json` right before saving. Another session may have saved a newer version since you created your machine, and your save would silently drop its changes.
- Quit anything holding memory, and stop dev servers, probes, and `staging-identity-tunnel.sh` (`stop <name>`). A snapshot keeps running processes.
- Remove scratch files from `/tmp` and any `.env.local` you created.
- Confirm `git config --global --list` and `~/.npmrc` contain no tokens.
- Do not copy SSH private keys or Mac `~/.npmrc` onto the machine.

Fork or create from the snapshot for real work. Destroy those with `boxd machine remove <name> --confirm` when done. Do not remove a machine another session created: check `boxd machine list` and ask first.
