---
name: remote-lambda-microvm-machine
description: |
  Create and use Kento's dev machines on AWS Lambda MicroVMs (the `mvm` CLI), reach them over SSH, show their dev servers on the laptop, and use them in Herdr or tuios.
  Use when the user says mvm, microvm, lambda microvm, lambda dev machine, or wants a boxd-like dev machine on AWS.
---

# Lambda MicroVM machine

One dev image, one machine per task, plain `ssh <name>.mvm`, Herdr or tuios on top.
The coding agent runs on the machine, not on the laptop: the laptop starts the machine and forwards the user's prompt to `pi` or `omp` there.
The machine reaches staging (identity API, AppSync schema) on its own: no tunnel, no copying.

## Commands

```bash
mvm new [NAME] [--ttl 8h] [--json]   # start a machine (random adjective-noun name if omitted), wait for ssh, add to herdr, open its tuios session
mvm rm NAME... [--discard]           # terminate (unpushed work is pushed first), remove from herdr and tuios
mvm ls [--json]                      # machines: state, image version, age, time left, herdr label, tuios session, forwarded ports
mvm ssh NAME [CMD...]                # same as ssh NAME.mvm [CMD...]
mvm tuios NAME                       # open the machine's tuios session aws-NAME again (after a dropped connection)
mvm forward NAME [PORT...] [--stop]  # reach the machine's dev servers at http://localhost:PORT
mvm logs NAME [-f] [--since 1h]      # the machine's logs: workspace setup, hooks, network doctor, WIP saves
```

- Use `--json` to read results (`mvm new --json` gives `name` and `devServerPort`).
  No command prompts.
- If the laptop settings set `awsAuthentication` (an unattended `credential_process` profile), no command and no ssh connection waits for a login.
  Otherwise `mvm` runs itself under aws-vault SSO; if it prints an SSO device URL, the user must approve it in the browser: ask them.
- Create one machine per task.
  Parallel `mvm new` runs are safe.
- A machine lives at most 8 hours (`--ttl`), then AWS terminates it.
  It keeps running while nothing is connected (laptop closed, herdr quit) and costs about $0.55/h until `mvm rm` or the cap.
- Do not remove a machine another session created: check `mvm ls` and ask first.

## New machine

`mvm new` returns in about 20 seconds with the machine ssh-ready, in herdr and in the tuios rail.
The workspace setup continues in the background, usually for under a minute (`mvm logs <name> -f`, or `~/.local/state/mvm/bootstrap-status.json` on the machine, whose `phase` becomes `ready`):

- `conversation-center-ext` is cloned with its `.env.local` (staging), dependencies and Playwright Chromium.
- The other repos (`workspaceRepos` in the laptop settings) are cloned into `~/Documents/gitlab/aircall/<group>/<repo>`; they still need `pnpm install`.
- `~/dotfiles` is pulled, so pushed skill changes reach new machines.

On the machine:

- User `dev`, bash (not fish), no nix.
- No root: `sudo` cannot work. System packages go in the image (see Maintaining mvm).
- Tools: node (fnm) with pnpm, bun, `pi`, `omp`, `claude`, `codex`, `herdr`, `tuios`, `nvim`, `lazygit`, `glab`, `gh`, `jira`, `uv`, rust, AWS CLI, `agent-browser` with Chromium.
- Every bash, including `ssh <name>.mvm 'cmd'`, has the secrets (`GITLAB_TOKEN`, `GEMFURY_AUTH`, `LLM_GATEWAY_KEY`, `AIRCALL_STAGING_EMAIL`, `AIRCALL_STAGING_PASSWORD`, ...) from `~/.config/mvm/env.sh`.
  Git and npm read them at runtime: never write a token into `~/.gitconfig`, `~/.npmrc` or a repo.
- The AWS CLI uses the machine's own role (env secret, logs, the pnpm cache, AppSync schema introspection).
  Never copy laptop AWS keys onto the machine.

## Running commands and the agent

`ssh <name>.mvm` is real OpenSSH: `scp`, `rsync` and `-L` work, and commands get the full environment.

```bash
scp ./prompt.md <name>.mvm:/tmp/prompt.md
ssh <name>.mvm 'cd <worktree> && pi -p --mode json < /tmp/prompt.md'
ssh <name>.mvm 'cd <worktree> && omp -p < /tmp/prompt.md'
```

Redirect stdin so the agent does not wait on it.
Follow-ups resume the same remote session (`pi --resume <id>` from the first JSON result).
The laptop does not edit the checkout: the remote agent edits, tests, runs the dev server and drives `agent-browser` on the machine.
When the user wants to watch or steer the agent, run it live in the machine's tuios window instead (see tuios).

## Working on a ticket

- `conversation-center-ext` worktrees go through `scripts/new-worktree.sh` (shared pnpm store, own `.env.local` and `PORT`).
- The GraphQL schema and `src/graphql-env.d.ts` are committed.
  When a change needs newer fields, run `pnpm graphql:download && pnpm graphql:generate` on the machine, and commit the result only with the change that needs it.
- `pnpm dev` logs in to staging with the injected staging credentials and loads real staging data; use it, not `pnpm dev:mock`, when the proof needs real data.
- `pnpm e2e:local` also needs `E2E_USER_PASSWORD` in `.env.local`, which machines do not have yet.

## Dev server

Each machine has its own dev server port, `devServerPort` (3101-3199), unique among the laptop's machines and never the laptop's own 3002.
`mvm new` prints it, and `/etc/mvm/machine.json` on the machine has it.
The main checkout's `.env.local` sets it as `export PORT=31xx`, so `pnpm dev` uses it.
Keep the `export` form if you edit that file: with a plain `PORT=` line, new worktrees would inherit the machine's port instead of getting their own (20000-29999).

A dev server must outlive the ssh session, so detach it:

```bash
ssh <name>.mvm 'cd <checkout> && setsid -f pnpm dev > /tmp/dev.log 2>&1 < /dev/null'
```

Use `setsid -f`, not `setsid ... &`: a trailing `&` backgrounds the whole `cd && setsid` list in a subshell that keeps ssh's output open, so `ssh` hangs until the dev server stops.

- It is up when `/tmp/dev.log` shows `Local: http://localhost:<PORT>/`.
- Stop it with `pkill -f rsbuild-node`, not `pkill -f "rsbuild dev"`.
  A leftover server keeps its port, and a new one silently moves to the next free port: read the port from the log.
- On the machine, open it with `agent-browser open http://localhost:<PORT>/`.

### Show it on the laptop

The dev page loads assets and its HMR socket from absolute `http://localhost:<PORT>` URLs, so the laptop must use the same port number: use `mvm forward`, not a hand-made `ssh -L`.

```bash
mvm forward <name> <PORT>    # prints http://localhost:<PORT>/; re-running is harmless
mvm forward <name>           # every port the machine's dev user listens on (main checkout and worktrees)
mvm forward <name> --stop    # close them all
```

Flow: start the dev server, wait for its `Local:` line, run `mvm forward <name> <PORT>` on the laptop, and give the user the printed URL.
An agent running on the machine has no `mvm`: it reports the port, and the laptop runs `mvm forward`.

- A laptop port already in use is refused with the process or machine holding it.
  Without PORT arguments, busy ports are skipped with a warning.
- Worktrees with the same directory name on two machines get the same port: only one can be forwarded at a time.
- `mvm rm` and an ended machine close its forwards.
  After a laptop sleep or network drop they end within about 2 minutes: run `mvm forward` again.

## Herdr

Automatic: `mvm new` adds the machine as `aws-<name>` (an open herdr window connects on its own), `mvm rm` removes it, and a machine that hits its `--ttl` is removed by herdr's next reconnect or the next `mvm` command.
Never run `herdr machine add|remove` for `.mvm` hosts by hand.
Herdr reconnects need working AWS credentials: unattended with `awsAuthentication`, otherwise a valid aws-vault SSO session (see Troubleshooting).

## tuios

Automatic too: every machine gets a local tuios session `aws-<name>` in the space `mvm`, so all machines show in the rail under one `mvm` heading.
Its one window, `<name>.mvm`, is a plain ssh connection that shows the machine's own tuios session `main`.
The user watches and steers whatever runs in `main` from that window; no `tuios config apply` is ever needed.
The code is `scripts/mvm_cli/tuios_machine_session.py`.

### What `mvm new` does

1. Over ssh, on the machine:
   - writes `~/.config/tuios/config.d/mvm-laptop-window.toml`, which hides the machine's own rail and dock, so the window shows only the machine's pane;
   - in that file, sets the theme `catppuccin_mocha` with its background, so a machine's window never looks like a laptop pane (Melange).
     Pi's default `system` theme derives its colors from it; with no theme there, Pi fell back to raw ANSI colors (navy, olive, magenta);
   - creates the session `main` (starting the machine's tuios daemon), or gives an existing `main` a window if its last shell exited.
2. On the laptop, `tuios call new-session` creates `aws-<name>` in the space `mvm`, without a window.
   A session of that name left by an earlier machine is replaced, unless `mvm` runs inside it.
3. `tuios call new-window` adds the window `<name>.mvm`, which runs `ssh -t <name>.mvm /home/dev/.local/bin/tuios attach main --create --terminal-mode`.
   - Terminal mode: keys typed in the window go to the machine's pane, not to the machine's window manager.
   - No tuios grants (`none`): the window only runs ssh, and nothing in it can drive the laptop's tuios.
   - Kept open: when the connection drops, the window keeps its last lines and the exit status.
   - It does not take the focus.
4. It logs `<name>: tuios session aws-<name> (space mvm) shows the machine's session main`, and `mvm new --json` reports the session as `tuios` (`null` when none was opened).

It works the same from a tuios pane, from a terminal outside tuios, and from the dev-workflows support worker.
Without tuios installed the step is skipped; a stopped daemon or a refusal only logs a warning, and the machine is still created.

### Lifecycle

| When | What happens to `aws-<name>` |
| --- | --- |
| `mvm new` | Opened, as above. |
| `mvm ls` | The `TUIOS` column names the session when the laptop's daemon holds it. |
| `mvm tuios <name>` | Replaced by a fresh session and window; also rewrites the machine's config file and gives an empty `main` a window. Whatever runs in `main` keeps running. |
| `mvm rm <name>` | Closed. |
| `--ttl` reached | The window shows the closed connection; the next `mvm new` or `mvm ls`, or herdr's next reconnect, closes the session. |
| Session with no machine record | Closed by every prune: never create `aws-*` sessions in the space `mvm` by hand. |

`mvm` never closes the session it runs inside.

### Why a session and not a tuios host

Herdr's `herdr machine add` only saves a connection profile in its client state, and herdr has no permission model, so a new machine appears in its sidebar at once.
A tuios host link (`[hosts]` in the tuios config) is different: every pane can then read and type into that machine's sessions, so tuios treats a new host as giving panes more.
tuios holds such a change until the person runs `tuios config apply` in a terminal outside tuios, and refuses it from any pane, the support worker's included.
A session whose window only runs ssh gives no pane anything new, so tuios accepts it from anywhere.
The cost: local panes cannot address the machine as `<host>:<session>`.
A local agent types into the `aws-<name>` window instead (below), or runs the machine's own tuios over ssh: `ssh <name>.mvm /home/dev/.local/bin/tuios capture-pane -s main -w <window id>`.
Do not add `.mvm` machines to `[hosts]` or run `tuios hosts add` for them.

### A live agent the user watches

Start the agent in the window when the user wants to watch or steer it:

```bash
scp ./prompt.md <name>.mvm:/tmp/prompt.md
tuios send-text -s aws-<name> -w <name>.mvm 'cd <checkout> && pi --approve @/tmp/prompt.md
'
tuios capture-pane -s aws-<name> -w <name>.mvm   # read progress
# follow-up: the text, then Enter as a key once pi shows its input box
tuios send-text -s aws-<name> -w <name>.mvm '<follow-up>'
sleep 1; tuios send-keys -s aws-<name> -w <name>.mvm Enter
```

- `pi --approve` trusts the checkout's project files for that run, so pi does not stop on its trust question.
  `@/tmp/prompt.md` is the first prompt: no quoting, and no Enter racing pi's start-up.
- After a follow-up, check with `capture-pane` that the text left the input box; if it is still there, send Enter again (an Enter right after pi started was once ignored).
- The rail shows the agent's state (idle, done) on the `aws-<name>` window, reported through the nested client.
- The user types in the same pane: say before sending, and read the screen before typing over their input.
- Text goes to the focused pane of `main`: keep one agent there, and open other windows on the machine over plain `ssh <name>.mvm`.
- Never exit the shell in `main` (`exit`, a second ctrl+d): an empty `main` shows tuios's start screen, where typed text drives the machine's window manager.
- If the window shows a closed connection or that start screen, run `mvm tuios <name>`: it reconnects and gives an empty `main` a new window; an agent in `main` keeps running.

### Machines of the support workflow

The dev-workflows support worker creates its machines with `mvm new`, so each gets its `aws-<name>` session too.
Its agents run through the workflow's own ssh runner, not in `main`: the window shows `main`'s idle shell, not the job's agent.

### When the window looks wrong

- No `aws-<name>` session: `mvm new` logged why (tuios missing, daemon not running); run `mvm tuios <name>`.
- The window shows the machine's own rail and dock, or default colors instead of Catppuccin Mocha: `mvm new` could not reach the machine to write its config file (it logged `machine tuios not prepared`); `mvm tuios <name>` writes it and reattaches.
- tuios's start screen ("new window", "new session") inside the window: `main` lost its last window; `mvm tuios <name>`.
- The window ends with a closed connection: a network drop or the machine ended; `mvm ls` tells which, and `mvm tuios <name>` reconnects a live machine.
- A laptop that ran mvm before tuios sessions may still have `~/.config/tuios/config.d/mvm-hosts.toml` (host links): delete it, mvm no longer writes or cleans it.

## Unpushed work

When a machine is suspended or terminated (`mvm rm`, the `--ttl` cap), every checkout and worktree under `~/Documents` with uncommitted changes, untracked files or unpushed commits is pushed to GitLab as `wip/mvm/<name>/<branch>`.
Each is one snapshot commit on top of HEAD (message with `[CI-0000]`, pushed with `-o ci.skip`); gitignored files such as `.env.local` and `node_modules` are not included.
`mvm logs <name>` shows a line per pushed branch and a `FAILED` line per checkout that could not be saved.

- Recover on the laptop with `git fetch origin wip/mvm/<name>/<branch>`, and delete the ref once merged back.
- Save by hand on the machine with `mvm-save-wip-branches`.
- `mvm rm <name> --discard` skips the save at terminate.

## Troubleshooting

- `mvm logs <name>` (also after `mvm rm`): workspace setup, lifecycle hooks, network doctor, WIP saves.
- `ssh <name>.mvm` or `mvm forward` hangs or times out: the AWS credentials do not resolve.
  With `awsAuthentication`, run `aws sts get-caller-identity --profile <profile>`: its error names the failing credential_process (for aws-vault: a locked keychain, or a keychain access prompt after an aws-vault upgrade).
  Without it, the AWS SSO session expired: ask the user to run `aws-vault exec <awsVaultProfile> -- true` (profile from the laptop settings) and approve the browser prompt.
- `mvm forward` says `could not connect`: the reason is in `~/.local/state/mvm/forwards/<name>.log`.
- Staging login fails on the machine: the network doctor's `identityApiStatus` in `mvm logs <name>` should be 400 (the request reached the auth app); anything else means the machine cannot log in to staging.
- gitlab.com web pages answer AWS IPs with 403; git over HTTPS and the API work.
- pnpm install is slow or broken right after a cache restore (`pnpm store cache:` line in `mvm logs`): ask before clearing the shared cache with `aws-vault exec <awsVaultProfile> -- aws s3 rm --recursive s3://<ArtifactBucketName>/pnpm-store/`.
  The next machine installs cold and saves a fresh snapshot.
- Host key warnings: each machine gets fresh host keys; `mvm` forgets old ones in `~/.ssh/known_hosts_mvm`.

## Unattended AWS authentication: blocked

Status on 2026-10-24: every `mvm` command and every `mvm proxy` (ssh, herdr, tuios) still authenticates with the personal aws-vault SSO session, so they stop when it expires.
An attempt to make the laptop dispatcher (the dev-workflows support worker) authenticate unattended could not be completed.
Do not retry it until the access below exists.

- Planned: a dedicated IAM user with a scoped inline policy and no console password.
  Its access key would live in the macOS login keychain through aws-vault.
  An AWS CLI profile would use `credential_process = aws-vault export --format=json`, with one-hour GetSessionToken sessions renewed from the keychain.
  `awsAuthentication` would select that profile.
- Why it failed: the admin SSO permission set has an inline policy that explicitly denies `iam:CreateUser` and `iam:CreateAccessKey` on every resource.
  An explicit deny overrides its AdministratorAccess: `AccessDenied ... with an explicit deny in an identity-based policy`.
  No existing IAM user can receive a key either, and every future key rotation would hit the same deny.
  Nothing was created in AWS.
- It is an organization guardrail: do not work around it with another role, another user or edits to the SSO role.
  Unblocking needs the IAM Identity Center admins. They can grant a scoped exception (user and access-key actions only on the dispatcher's IAM path), or run the setup and every rotation themselves on the laptop.
- Ready for that day:
  - `awsAuthentication` support in mvm, inactive until set.
  - The private dev-workflows helper `bun run aws:dispatcher setup|rotate-key|check`.
  - The policy, runbook, rotation and revocation steps in that repo's `docs/aws-workflow-authentication.md`.
- Ruled out by the user: IAM Roles Anywhere, and moving the dispatcher to EC2/ECS.
  The deny does not cover role creation, but whether an SCP blocks Roles Anywhere was not tested.
- Notes for the retry:
  - MicroVM IAM actions use the `lambda:` prefix.
    `RunMicrovm`, `GetMicrovm`, `TerminateMicrovm` and `CreateMicrovmAuthToken` scope to the image ARN; `ListMicrovms` needs `*`.
  - Still unverified:
    - whether `RunMicrovm` needs `lambda:PassNetworkConnector`;
    - the `iam:PassedToService` value Lambda uses;
    - whether `sts:GetCallerIdentity` (mvm builds the image ARN from it) and `iam:PassRole` work with GetSessionToken credentials.
  - Homebrew's aws-vault is ad-hoc signed, so the keychain item trusts that exact binary.
    An upgrade makes the next access show a keychain dialog that nobody can answer unattended.
    `brew pin aws-vault` before storing the key.

## Maintaining mvm

```
infra/dev-microvm-stack.yaml   CloudFormation: artifact bucket (image builds, pnpm store cache), roles, env secret, log group
image/Dockerfile, image/rootfs the dev image (Ubuntu 24.04 arm64) and its files (/opt/mvm/bin hooks and helpers)
scripts/mvm, scripts/mvm_cli/  laptop CLI (Python stdlib); tests are *_test.py next to each module
scripts/completions/mvm.fish   fish completion, linked by `mvm setup`
```

Per-person values stay out of this public repo, in `~/.config/mvm/settings.json` on the laptop (`MVM_SETTINGS_FILE` overrides the path).
Create it before `mvm setup`:

```json
{
  "awsVaultProfile": "<aws-vault profile of the AWS account>",
  "ownerEmail": "<work email>",
  "gitUserName": "<name for git commits>",
  "workspaceRepos": ["dashboard-extensions/conversation-center-ext", "<group>/<repo>"],
  "awsAuthentication": {"kind": "profile", "profile": "<AWS CLI profile>"}
}
```

- `awsAuthentication` (optional): how every AWS call authenticates, `mvm proxy` included, so herdr, tuios and ssh reconnect unattended.
  `{"kind": "profile", "profile": NAME}` uses that AWS CLI profile (typically a `credential_process`) and drops inherited credentials, `AWS_VAULT` included; `{"kind": "default-chain"}` uses the AWS SDK chain (EC2/ECS role).
  Either one never falls back to `awsVaultProfile`.
  `MVM_AWS_PROFILE=NAME` overrides it for one command.
- `awsVaultProfile`: aws-vault SSO profile for every AWS call when `awsAuthentication` is absent (`MVM_AWS_VAULT_PROFILE` overrides it).
- `ownerEmail`: owner tag on the stack and image, and git `user.email` on the machines, with `gitUserName` as `user.name`.
- `workspaceRepos`: GitLab repos every new machine clones; keep `conversation-center-ext` first.
- `mvm image build` bakes the git identity and the repo list into the image: rebuild after changing them.

```bash
mvm setup           # deploy the stack, ssh key + ~/.ssh/config block, ~/.local/bin/mvm, fish completion
mvm secrets push    # copy the dev env vars from this shell into the machines' secret (rerun after rotating a token)
mvm image build     # new image version from image/ (about 6 minutes); new machines use the latest successful one
```

These three need administrator rights, which a scoped `awsAuthentication` profile does not have.
Run them with an admin AWS CLI profile: `aws sso login --profile <admin>`, then `MVM_AWS_PROFILE=<admin> mvm image build`.
`aws-vault exec <admin> -- mvm ...` does not work once `awsAuthentication` is set: the configured profile replaces inherited credentials.

- Tests: `cd scripts && nix shell nixpkgs#zstd -c python3 -m unittest discover -s mvm_cli -p '*_test.py' -t .`, and again with `/usr/bin/python3` (3.9): ssh and herdr run `mvm proxy` with macOS's python.
- A new command or flag needs `scripts/completions/mvm.fish` too: `fish_completion_test.py` fails until it matches.
- Secret names come from `SECRET_ENV_NAMES` in `scripts/mvm_cli/mvm_settings.py`.
  No secret ever goes into the image, `image/rootfs`, `~/.gitconfig` or `~/.npmrc`.
- AWS: the account of the `awsVaultProfile` aws-vault profile, region `eu-central-1`; `mvm` needs AWS CLI >= 2.35 and `websocat` (nix-darwin).
- Keep the laptop's herdr on the image's `HERDR_VERSION` (Dockerfile): with a mismatch, `herdr machine add` may replace the remote server or stop being prompt-free.
- The laptop's tuios and the image's `TUIOS_VERSION` may differ: the laptop's window only runs ssh, and the machine's own tuios client draws inside it.
  The window runs that client by its path, `/home/dev/.local/bin/tuios` (`TUIOS_REMOTE_BINARY` in `mvm_settings.py`): keep the image installing it there.
- Machine names exist only on the laptop, in `~/.local/state/mvm/machines/<name>.json`.
  Cleanup forgets a machine only after AWS confirms it ended.
- The pnpm store cache (`image/rootfs/opt/mvm/bin/mvm-pnpm-store-cache`) is shared and writable by every machine: a compromised machine could poison later installs, beyond what the lockfile checks.
- Lambda MicroVM quirks: every process runs with `no_new_privs` (no sudo), `/etc/hosts` is read-only, image identifiers must be ARNs, `ALL_INGRESS` cannot be combined with other ingress connectors, and the `/run` hook must finish within 60 seconds.
