---
name: lambda-microvm-machine
description: |
  Create and use Kento's dev machines on AWS Lambda MicroVMs (the `mvm` CLI), reach them over SSH, and use them in Herdr.
  Use when the user says mvm, microvm, lambda microvm, lambda dev machine, or wants a boxd-like dev machine on AWS.
---

# Lambda MicroVM machine

The AWS Lambda MicroVM counterpart of the `boxd-machine` skill.
One dev image, one machine per task, plain `ssh <name>.mvm`, Herdr on top.
The CLI is `mvm` (`~/.local/bin/mvm`, a link to `scripts/mvm`; Python, stdlib only).

The coding agent runs on the machine, not on the laptop.
The laptop starts the machine and forwards the user's prompt to `pi` or `omp` there.
Unlike boxd, the machine reaches the staging identity API and the AppSync schema on its own: no tunnel, no schema copying.

## Commands

```bash
mvm new [NAME] [--ttl 8h] [--json]   # start a machine (random adjective-noun name if omitted), wait for ssh, add to herdr
mvm rm NAME... [--discard]           # terminate (unpushed work is pushed first), remove from herdr
mvm ls [--json]                      # machines: state, image version, age, time left, herdr label, forwarded ports
mvm ssh NAME [CMD...]                # same as ssh NAME.mvm [CMD...]
mvm forward NAME [PORT...] [--stop]  # reach the machine's dev servers at http://localhost:PORT (see Dev server)
mvm logs NAME [-f] [--since 1h]      # the machine's logs: workspace setup, hooks, network doctor, WIP saves

mvm setup                            # one-time: AWS stack, ssh key + ~/.ssh/config block, ~/.local/bin/mvm, fish completion
mvm secrets push                     # copy the dev env vars from this shell into the machines' secret
mvm image build                      # build a new image version from image/ (about 6 minutes)
```

Agents: use `mvm new --json` to capture the generated name, and `mvm ls --json`.
When adding a command or flag, update `scripts/completions/mvm.fish` too: `fish_completion_test.py` fails until it matches the parser.
No prompts anywhere.

Herdr is automatic:

- `mvm new` runs `herdr machine add <name>.mvm --label aws-<name>` (no prompt, a few seconds).
  An open herdr window shows and connects the new machine on its own.
- `mvm rm` removes that entry.
- A machine that ends on its own (the `--ttl` cap) is removed from herdr by the next `mvm` command, or by herdr's next automatic reconnect attempt.
  That reconnect runs `mvm proxy`, which sees the endpoint fail, confirms with AWS that the machine ended, and cleans up.

Cleanup fails closed: a machine is forgotten only once AWS confirms it ended.
An expired AWS SSO session never removes anything.

Do not remove a machine another session created: check `mvm ls` and ask first.

## Layout

```
infra/dev-microvm-stack.yaml   CloudFormation: S3 artifact bucket (image builds, pnpm store cache), build + execution roles, env secret, log group
image/Dockerfile               the dev image (Ubuntu 24.04 arm64, tools pinned by version)
image/rootfs/                  files copied into the image (/opt/mvm/bin hooks and helpers, sshd config, .gitconfig, .npmrc)
scripts/mvm                    laptop CLI entry point; commands in scripts/mvm_cli/ (tests: *_test.py next to each module)
scripts/completions/mvm.fish   fish completion (commands, flags, local machine names), linked into ~/.config/fish/completions by `mvm setup`
```

Run the CLI tests with `cd scripts && python3 -m unittest discover -s mvm_cli -p '*_test.py' -t .`.
`pnpm_store_cache_test.py` runs the machine's cache script and skips without `zstd`: wrap the command in `nix shell nixpkgs#zstd -c`.
They must also pass under `/usr/bin/python3` (3.9): ssh and herdr run `mvm proxy` with a minimal `PATH` where `python3` is macOS's.

AWS account `886862221201` (ConversationInteAdmin, aws-vault profile `ConversationInteAdmin-886862221201`), region `eu-central-1`.
`mvm` re-runs itself under `aws-vault exec` when the environment has no AWS credentials.
If aws-vault prints an SSO device URL, the user must approve it in the browser: ask them.

`mvm` needs AWS CLI >= 2.35 (`aws lambda-microvms`) and `websocat`.
Both come from nix-darwin (`awscli2`, `websocat` in `.config/nix-darwin/common.nix`).
`mvm` puts `/run/current-system/sw/bin` first on `PATH`; `MVM_AWS_CLI=/path/to/aws` overrides the choice.

Machine names live only on this laptop, in `~/.local/state/mvm/machines/<name>.json` (MicroVMs have ids, no names or tags).

## Setup and secrets

Run `mvm secrets push` from a shell that has the secrets loaded (the fish config does that).
It copies `SECRET_ENV_NAMES` from `scripts/mvm_cli/mvm_settings.py`; add more with `MVM_EXTRA_SECRET_NAMES=A,B`.
Rerun it after rotating a token: machines read the secret when they start, so running machines keep the old value.

## Image

Rebuild after changing `image/` or bumping a pinned version: `mvm image build`.
On failure it prints the tail of the build log.
Each build is a new image version; `mvm new` uses the latest successful one.

The image has, for the `dev` user (uid 1000):

- node (fnm default) with corepack pnpm, bun, `pi`, `omp`, `portless`, `claude`, `codex`, `herdr` + the herdr-vim-nav plugin, `nvim`, `lazygit`, `yazi`, `glab`, `gh`, `jira`, `uv`, rust, AWS CLI v2, `agent-browser` with Playwright Chromium.
- `~/dotfiles` cloned from GitHub, with `~/.agents`, `~/.pi/agent/*`, `~/.omp/agent`, `~/.config/{herdr,nvim,yazi}` linked.
  The machine pulls dotfiles at start, so skill changes reach new machines once they are pushed to GitHub.
- Bash, not fish.
  Nix is Mac-only.
- No root: Lambda starts every MicroVM process with `no_new_privs`, so `sudo` cannot work.
  Add system packages to the Dockerfile and rebuild the image.

`mvm image build` also adds two laptop files to the build zip:

- `~/.config/.jira/.config.yml` (non-secret jira-cli config).
  It is refused if it looks like it holds a token or password.
- A git bundle of `~/Documents/github/kentoje/herdr-vim-nav` at HEAD.
  The repo is private and the build has no GitHub credentials.

No secrets are in the image.
Never add a token to the Dockerfile, `image/rootfs`, `~/.gitconfig` or `~/.npmrc`.

## Secrets and AWS credentials on the machine

At start, the `/run` hook reads the `dev-microvm/kento/env` secret with the execution role and writes `~/.config/mvm/env.sh` (mode 600).
`~/.bashrc` sources it, so `GITLAB_TOKEN`, `GEMFURY_AUTH`, `LLM_GATEWAY_KEY`, `AIRCALL_STAGING_EMAIL`, `AIRCALL_STAGING_PASSWORD` and the rest are in every bash, including `ssh <name>.mvm 'cmd'`.
GitLab clones use a credential helper that reads `GITLAB_TOKEN` at runtime, and `~/.npmrc` references `${GEMFURY_AUTH}` and `${GITLAB_TOKEN}`.

The AWS CLI on the machine uses the execution role `dev-microvm-kento-execution` through the instance metadata service.
That role can read only the env secret, write logs, read and write the `pnpm-store/` prefix of the artifact bucket (see below), and run AppSync `GetIntrospectionSchema` in us-west-2.
Do not copy laptop AWS keys onto the machine.

## New machine

`mvm new` returns in about 20 seconds with the machine ssh-ready and in herdr.
A machine lives at most 8 hours (`--ttl`), then AWS terminates it.
Create one machine per task.
It keeps running while nothing is connected (laptop closed, herdr quit), so agents keep working; it costs about $0.55/h until `mvm rm` or the cap.

At start the machine sets up the workspace in the background (usually about a minute, several when GitLab is slow; follow it with `mvm logs <name> -f`):

1. `git pull` in `~/dotfiles`.
2. Clone `conversation-center-ext`, write its `.env.local`, restore the pnpm store cache, then `pnpm install` and Playwright Chromium.
3. Meanwhile, clone the other repos from `image/rootfs/opt/mvm/etc/workspace-repos.txt` (blob-less) into `~/Documents/gitlab/aircall/<group>/<repo>`.

The `.env.local` is the README's `cp .env.example .env.local` (staging `PUBLIC_*` URLs, `AWS_APP_ID`), minus the empty `AWS_*` key and `E2E_USER_PASSWORD` lines, plus `export PORT=<devServerPort>` (see Dev server).
Empty AWS keys would shadow the machine's execution role.
Per-step status and durations are in `~/.local/state/mvm/bootstrap-status.json` on the machine.
Other repos still need `pnpm install`.

### pnpm store cache

A cold `conversation-center-ext` install downloads about 2,300 packages and compiles `cpu-features` and `ssh2` (about a minute).
So machines share their pnpm store through S3, with `image/rootfs/opt/mvm/bin/mvm-pnpm-store-cache`:

- Before the install, the machine restores the snapshot saved for the same `pnpm-lock.yaml` (`exact`), else the newest one (`latest`), else nothing (`miss`).
  A snapshot holds `~/.local/share/pnpm/store` (with built native modules) and `~/.cache/pnpm` (package metadata).
- The install runs `--prefer-offline`: after an `exact` hit it downloads nothing and skips the native builds.
  Measured on image v11: workspace setup takes 65s cold and 37s with an `exact` hit (a 585 MB snapshot, restored in 5s).
- After a `latest` or `miss` install, the machine archives the store before Playwright starts and uploads it in the background, so the next machine gets an `exact` hit.
  `latest` moves only after the snapshot is fully uploaded.
- Keys: `s3://<artifact bucket>/pnpm-store/conversation-center-ext/<sha256 of pnpm-lock.yaml>.tar.zst` and `.../latest` (the newest snapshot's file name).
  Snapshots expire after 30 days.
  Nothing prunes the store: a snapshot saved after a `latest` hit keeps the old packages too, so snapshots grow with each lockfile change.
  The `archived ... (SIZE)` log line shows the size; clearing the cache resets it.
- `mvm new` passes the cache location in the run payload; the machine keeps it in `/etc/mvm/machine.json`.
- Cache errors never fail the workspace setup: they log a line and fall back to a cold install.
  The hit kind, timings and sizes are in `mvm logs <name>` (`[mvm-pnpm-store-cache]` and `pnpm store cache:` lines).

Every machine can write the cache, and later machines trust what they restore.
A compromised machine could upload a snapshot that changes package files (through the store index), built native modules, and the cached supply-chain (`minimumReleaseAge`) verdict and metadata.
Do not rely on the lockfile to catch that.
Clear the cache when in doubt (see Troubleshooting).

## Running commands

`ssh <name>.mvm` is real OpenSSH: `scp`, `rsync` and `-L` port forwards work.
The ssh ProxyCommand (`mvm proxy`, hidden from `--help`) mints a 60-minute endpoint token and pipes the connection through `websocat` to the machine's WebSocket bridge in front of sshd.
AWS keeps minting tokens for a terminated machine, whose endpoint then answers `502 Bad Gateway`: that failure is what triggers the cleanup.
An open session survives the token expiry; only new connections mint a new token.

```bash
ssh <name>.mvm 'cd ~/Documents/gitlab/aircall/shared/hydra && pnpm install'
scp ./prompt.md <name>.mvm:/tmp/prompt.md
```

Plain `ssh <name>.mvm 'cmd'` has the full environment: bash reads `~/.bashrc` for ssh commands, and its top part (before the non-interactive `return`) loads `env.sh` and puts fnm's node, bun and `~/.local/bin` on `PATH`.

## Run the agent on the machine

`pi` and `omp` are configured from the dotfiles (llmgateway, `LLM_GATEWAY_KEY` is injected).
Copy the prompt to a file with `scp`, and redirect stdin so the agent does not wait on it.

```bash
ssh <name>.mvm 'cd <worktree> && pi -p --mode json < /tmp/prompt.md'
ssh <name>.mvm 'cd <worktree> && omp -p < /tmp/prompt.md'
```

The laptop does not edit the checkout.
The remote agent edits files, runs tests, starts the dev server and drives `agent-browser` on the machine.
Follow-ups resume the same remote session (`pi --resume <id>` from the first JSON result).

## Working on a ticket

`conversation-center-ext` worktrees go through `scripts/new-worktree.sh` (shared pnpm store, `.env.local` copied with a free `PORT`).
The main checkout's dev server uses the machine's own port; each worktree gets its own (see Dev server).

## GraphQL schema

`src/graphql/schema.graphql` and `src/graphql-env.d.ts` are committed in `conversation-center-ext`, so a fresh clone or worktree is already typed.
When a change needs fields newer than the committed schema, refresh it on the machine, in the checkout or worktree:

```bash
pnpm graphql:download && pnpm graphql:generate
```

The AWS CLI uses the machine's execution role, which may run AppSync `GetIntrospectionSchema` in us-west-2.
No laptop credentials, no copying.
Commit the regenerated files only with the change that needs them, as the team does.

## Dev server

Each machine has its own dev server port, `devServerPort` (3101-3199): unique among the laptop's machines, and never the laptop's own 3002.
Parallel `mvm new` runs are safe: they take a lock in `~/.local/state/mvm` while choosing names and ports.
`mvm new` prints it, and it is in `/etc/mvm/machine.json` on the machine.
The main `conversation-center-ext` checkout's `.env.local` sets it as `PORT`, so `pnpm dev` and `pnpm e2e:local` use it.
Worktrees made with `scripts/new-worktree.sh` still get their own `PORT` (20000-29999), appended to their copy of `.env.local`.
That works because the machine writes `export PORT=31xx`, not `PORT=31xx`: the worktree script only assigns a port when the copied file has no `PORT=` line.
Keep that form when editing `.env.local`.

A dev server must outlive the ssh session, so detach it:

```bash
ssh <name>.mvm 'cd <repo> && setsid pnpm dev > /tmp/dev.log 2>&1 < /dev/null &'
```

Rsbuild renames its process to `rsbuild-node`: stop it with `pkill -f rsbuild-node`, not `pkill -f "rsbuild dev"`.
A leftover server keeps its port, and the new one silently moves to the next free port.

Open the app with `agent-browser open http://localhost:<PORT>/` on the machine.

### Show the dev server on the laptop

The dev page loads its assets and HMR socket from absolute `http://localhost:<PORT>` URLs, so the laptop must use the same port number.
`mvm forward` does that over one background ssh connection per machine:

```bash
mvm forward <name> <PORT>    # prints http://localhost:<PORT>/; re-running is harmless
mvm forward <name>           # every port the machine's dev user listens on (dev servers in the main checkout and worktrees)
mvm forward <name> --stop    # close them all
```

Agent flow: start the dev server on the machine, wait until `/tmp/dev.log` says it is ready, run `mvm forward <name> <PORT>` on the laptop, and give the user the printed URL.
An agent running on the machine has no `mvm`: it reports its port, and the laptop runs `mvm forward`.

- `mvm ls` shows the forwarded ports (PORTS column, `forwardedPorts` in `--json`).
- `mvm rm` closes a machine's forwards, and so does the ended-machine cleanup (a machine that hits its `--ttl` frees its ports within about 30 seconds).
  A laptop sleep or network drop ends them once ssh's keepalive gives up (about 2 minutes): run `mvm forward` again.
- A laptop port already in use is refused, naming the process or the other machine that forwards it.
  Without PORT arguments, busy ports are skipped with a warning (agent tools also listen as dev).
- Two machines' worktrees with the same directory name get the same port: stop one machine's forwards first.
- Machines started by an older `mvm` have no `devServerPort`: their main checkout uses 3002, like the laptop's own dev server.

## Staging login

The machine reaches `id.aircall-staging.com` directly.
Its WAF blocks hosting-provider IPs such as boxd's, but AWS egress IPs are allowed.
`mvm logs <name>` shows the network doctor's `identityApiStatus` (also in `/var/lib/mvm/network-doctor.json` on the machine): 400 (`'email' is required`) means the request reached the auth app, 403 means blocked egress.

- `pnpm dev` in `conversation-center-ext`: `build/dev-auth.ts` logs in with the injected `AIRCALL_STAGING_EMAIL` / `AIRCALL_STAGING_PASSWORD` on the first page load and sets the `ac-auth.*` cookies.
  The app then loads real staging data from `internal.aircall-staging.com` and `internal-api.aircall-staging.com/graphql`.
- Token refresh in the machine's browser goes to the same API, so sessions survive the 1-hour token expiry.
- Playwright e2e (`pnpm e2e:local`) also needs `E2E_USER_PASSWORD` in `.env.local`.
  It is not in the env secret yet.

Use `pnpm dev`, not `pnpm dev:mock`, when the proof needs real staging data.

## Herdr

`mvm new` and `mvm rm` keep herdr's saved machines in sync (label `aws-<name>`); never run `herdr machine add|remove` for `.mvm` hosts by hand.
The image has `~/.local/bin/herdr` (`HERDR_VERSION` in the Dockerfile) and the vim-nav plugin linked.
Keep the laptop's herdr on the same version: with a mismatch, `machine add` may replace the remote server or stop being prompt-free.

Herdr reconnects through the same ssh ProxyCommand, so each reconnect mints a token through aws-vault.
When the AWS SSO session has expired, reconnects fail after 30 seconds until it is refreshed in a terminal (see Troubleshooting).

## End of life and unpushed work

Unpushed work is saved to GitLab whenever a machine is suspended or terminated while running: by the `/suspend` hook and by the `/terminate` hook (`mvm rm` or the 8-hour cap).
Lambda never calls `/terminate` for a suspended machine, so the suspend-time save is what protects a machine that ends while suspended.
`mvm new` sets no idle policy, so machines only suspend through the API.
All four cases were tested: `mvm rm` running, `mvm rm` suspended, the cap while running, the cap while suspended.

The save pushes every checkout and worktree under `~/Documents` that has uncommitted changes, untracked files or commits on no remote branch.
Each goes to `refs/heads/wip/mvm/<name>/<branch>` as one snapshot commit on top of HEAD, with `-o ci.skip`, force-pushed over the previous save of the same branch.
Gitignored files (`.env.local`, `node_modules`) are not included.
The commit message carries `[CI-0000]`, because Aircall's GitLab push rules reject commit messages without a Jira key.
The working tree and index are not touched.
Repos the workspace setup is still cloning are not saved: they are cloned in `~/.cache/mvm/clones` and moved under `~/Documents` only when complete.
`mvm logs <name>` shows one line per pushed branch, a `FAILED` line per checkout that could not be saved, and a final `[mvm-save-wip] done: checked N checkouts` line.
Run `mvm-save-wip-branches` on the machine to do it by hand.
Recover on the laptop with `git fetch origin wip/mvm/<name>/<branch>`, and delete the ref once it is merged back.

`mvm rm <name> --discard` skips the terminate-time push (an earlier suspend-time save stays).

## Troubleshooting

- `mvm logs <name>` shows the machine's stream (`machine-<name>` in CloudWatch): lifecycle hooks, workspace setup, network doctor, WIP saves.
  It still works after `mvm rm`.
- gitlab.com's web pages answer AWS IPs with 403; git over HTTPS and the API work, which is what the network doctor checks.
- `ssh <name>.mvm` hangs or says `timed out`: the AWS SSO session expired.
  Run `aws-vault exec ConversationInteAdmin-886862221201 -- true` and approve the browser prompt.
- pnpm install on a new machine is slow or broken after a cache restore: clear the cache with `aws-vault exec ConversationInteAdmin-886862221201 -- aws s3 rm --recursive s3://<artifact bucket>/pnpm-store/` (the bucket is the stack's `ArtifactBucketName` output).
  The next machine installs cold and saves a fresh snapshot.
- `mvm forward` says `could not connect`: the reason is in `~/.local/state/mvm/forwards/<name>.log` (the same ssh path as `ssh <name>.mvm`).
- Host key warnings: each machine gets fresh host keys; `mvm new` and cleanup forget the old ones in `~/.ssh/known_hosts_mvm`.
- Lambda MicroVM API quirks: image identifiers must be ARNs, `ALL_INGRESS` cannot be combined with other ingress connectors, and the `/run` hook timeout is at most 60 seconds.
