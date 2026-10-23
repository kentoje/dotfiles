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
mvm new [NAME] [--ttl 8h] [--json]   # start a machine (random adjective-noun name if omitted), wait for ssh, add to herdr and tuios
mvm rm NAME... [--discard]           # terminate (unpushed work is pushed first), remove from herdr and tuios
mvm ls [--json]                      # machines: state, image version, age, time left, herdr label, tuios host, forwarded ports
mvm ssh NAME [CMD...]                # same as ssh NAME.mvm [CMD...]
mvm forward NAME [PORT...] [--stop]  # reach the machine's dev servers at http://localhost:PORT
mvm logs NAME [-f] [--since 1h]      # the machine's logs: workspace setup, hooks, network doctor, WIP saves
```

- Use `--json` to read results (`mvm new --json` gives `name` and `devServerPort`).
  No command prompts.
- `mvm` runs itself under aws-vault.
  If it prints an SSO device URL, the user must approve it in the browser: ask them.
- Create one machine per task.
  Parallel `mvm new` runs are safe.
- A machine lives at most 8 hours (`--ttl`), then AWS terminates it.
  It keeps running while nothing is connected (laptop closed, herdr quit) and costs about $0.55/h until `mvm rm` or the cap.
- Do not remove a machine another session created: check `mvm ls` and ask first.

## New machine

`mvm new` returns in about 20 seconds with the machine ssh-ready and in herdr.
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
Herdr reconnects need a valid AWS SSO session (see Troubleshooting).

## tuios

Automatic too: `mvm new` writes the machine as tuios host `aws-<name>` and starts its tuios daemon (`tuios hosts test aws-<name> --start`).
mvm owns `~/.config/tuios/config.d/mvm-hosts.toml` (gitignored) and rebuilds it from the machine records on `mvm new`, `mvm rm` and every prune, so an ended machine leaves tuios at once.
A new host waits for `tuios config apply` from a terminal outside tuios, for example the Cmd+b quick terminal: tuios refuses it inside a pane by design.
`mvm new` never runs it (it would also approve any other pending widening, such as an agent's permissions edit): it logs that one step.
Never edit `mvm-hosts.toml` or run `tuios hosts add|remove` for `.mvm` hosts by hand.
Then press enter on `aws-<name>` in the rail, or `tuios new --host aws-<name>`.

## Unpushed work

When a machine is suspended or terminated (`mvm rm`, the `--ttl` cap), every checkout and worktree under `~/Documents` with uncommitted changes, untracked files or unpushed commits is pushed to GitLab as `wip/mvm/<name>/<branch>`.
Each is one snapshot commit on top of HEAD (message with `[CI-0000]`, pushed with `-o ci.skip`); gitignored files such as `.env.local` and `node_modules` are not included.
`mvm logs <name>` shows a line per pushed branch and a `FAILED` line per checkout that could not be saved.

- Recover on the laptop with `git fetch origin wip/mvm/<name>/<branch>`, and delete the ref once merged back.
- Save by hand on the machine with `mvm-save-wip-branches`.
- `mvm rm <name> --discard` skips the save at terminate.

## Troubleshooting

- `mvm logs <name>` (also after `mvm rm`): workspace setup, lifecycle hooks, network doctor, WIP saves.
- `ssh <name>.mvm` or `mvm forward` hangs or times out: the AWS SSO session expired.
  Ask the user to run `aws-vault exec <awsVaultProfile> -- true` (profile from the laptop settings) and approve the browser prompt.
- `mvm forward` says `could not connect`: the reason is in `~/.local/state/mvm/forwards/<name>.log`.
- Staging login fails on the machine: the network doctor's `identityApiStatus` in `mvm logs <name>` should be 400 (the request reached the auth app); anything else means the machine cannot log in to staging.
- gitlab.com web pages answer AWS IPs with 403; git over HTTPS and the API work.
- pnpm install is slow or broken right after a cache restore (`pnpm store cache:` line in `mvm logs`): ask before clearing the shared cache with `aws-vault exec <awsVaultProfile> -- aws s3 rm --recursive s3://<ArtifactBucketName>/pnpm-store/`.
  The next machine installs cold and saves a fresh snapshot.
- Host key warnings: each machine gets fresh host keys; `mvm` forgets old ones in `~/.ssh/known_hosts_mvm`.

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
  "workspaceRepos": ["dashboard-extensions/conversation-center-ext", "<group>/<repo>"]
}
```

- `awsVaultProfile`: every AWS call, `mvm proxy` included (`MVM_AWS_VAULT_PROFILE` overrides it).
- `ownerEmail`: owner tag on the stack and image, and git `user.email` on the machines, with `gitUserName` as `user.name`.
- `workspaceRepos`: GitLab repos every new machine clones; keep `conversation-center-ext` first.
- `mvm image build` bakes the git identity and the repo list into the image: rebuild after changing them.

```bash
mvm setup           # deploy the stack, ssh key + ~/.ssh/config block, ~/.local/bin/mvm, fish completion
mvm secrets push    # copy the dev env vars from this shell into the machines' secret (rerun after rotating a token)
mvm image build     # new image version from image/ (about 6 minutes); new machines use the latest successful one
```

- Tests: `cd scripts && nix shell nixpkgs#zstd -c python3 -m unittest discover -s mvm_cli -p '*_test.py' -t .`, and again with `/usr/bin/python3` (3.9): ssh and herdr run `mvm proxy` with macOS's python.
- A new command or flag needs `scripts/completions/mvm.fish` too: `fish_completion_test.py` fails until it matches.
- Secret names come from `SECRET_ENV_NAMES` in `scripts/mvm_cli/mvm_settings.py`.
  No secret ever goes into the image, `image/rootfs`, `~/.gitconfig` or `~/.npmrc`.
- AWS: the account of the `awsVaultProfile` aws-vault profile, region `eu-central-1`; `mvm` needs AWS CLI >= 2.35 and `websocat` (nix-darwin).
- Keep the laptop's herdr on the image's `HERDR_VERSION` (Dockerfile): with a mismatch, `herdr machine add` may replace the remote server or stop being prompt-free.
- Keep the laptop's tuios (brew) on the image's `TUIOS_VERSION`: a link to a daemon on another protocol shows `incompatible`; `tuios hosts sync aws-<name>` fixes one running machine.
- Machine names exist only on the laptop, in `~/.local/state/mvm/machines/<name>.json`.
  Cleanup forgets a machine only after AWS confirms it ended.
- The pnpm store cache (`image/rootfs/opt/mvm/bin/mvm-pnpm-store-cache`) is shared and writable by every machine: a compromised machine could poison later installs, beyond what the lockfile checks.
- Lambda MicroVM quirks: every process runs with `no_new_privs` (no sudo), `/etc/hosts` is read-only, image identifiers must be ARNs, `ALL_INGRESS` cannot be combined with other ingress connectors, and the `/run` hook must finish within 60 seconds.
