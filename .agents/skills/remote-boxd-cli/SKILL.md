---
name: remote-boxd-cli
description: |
  Manage boxd cloud machines from the user's local terminal using the **external** `boxd` CLI.
  Use when: creating, forking, listing, stopping/starting, or destroying machines; running commands inside
  machines; copying files to/from machines; managing HTTPS subdomain proxies; configuring
  auto-suspend; delegating work to in-VM agents. Also use when the user says "boxd", "spin up a
  machine", "deploy this", "run this in the cloud", "make this live", or mentions `*.boxd.sh` URLs.
  This skill is for the **external CLI** (runs on the user's laptop). For the **internal (in-VM)
  CLI** available inside every boxd machine, use the `boxd` skill instead.
---

# boxd CLI (external)

boxd gives you full Linux computers in the cloud that boot in ~2 seconds. Each machine gets a public IP, persistent disk, and automatic HTTPS at `https://name.boxd.sh`. You fork them like git branches, run many in parallel, destroy them when done.

You are on the user's **local machine** — this is the **external** `boxd` CLI. It talks to the boxd public gRPC API and manages machines remotely. The CLI binary is `boxd`, installed at `~/.local/bin/boxd`.

> There is also an **internal** `boxd` CLI pre-installed *inside* every machine, used for in-VM operations. Both share the `boxd` name, but they are separate binaries with overlapping-but-different command surfaces. This skill documents the external one.

> **Flags vs. behavior.** `boxd <cmd> --help` is the authoritative, always-current reference for *syntax* — flags and subcommands, straight from the installed binary, so it never drifts. This skill is the reference for *behavior* — semantics, scoping, security caveats, gotchas, and when to reach for each command. If the two ever seem to disagree on what a command *does*, trust the behavior described here.

## Command shape

The surface is a nested tree. Top-level groups:

- **`machine`** (alias `m`) — everything about machines: create, list, inspect, run, connect, copy, publish ports, custom domains, networks, checkpoints, backups, resize, share, state control, remove, rename, per-machine settings.
- **`snapshots`** (alias `snap`) — save machine state and spin up fast copies.
- **`disks`** — standalone storage you attach to a machine, then move to another one later.
- **`teams`** — org-scoped sub-groups of members, each with an optional default snapshot.
- **`auth`** — identity, orgs (create, rename, roster, invites), sign-in, API keys.
- **`manage`** — billing (plan, balance, activity), usage and cost, integrations, the org's wildcard domain, the org's default machine size, and the org's default backup schedule.
- **`env`** — environment variables and secrets injected into your machines.
- **`config`** — CLI settings (api-url, client-utils).
- **`docs` / `completions` / `version`**.

`remove` is the canonical delete verb everywhere, with `rm` as the alias. Common aliases: `m` (machine), `snap` (snapshots), `ls` (list), `ssh` (connect), `info` (get), `rm` (remove). `connect`, `new`, and `list`/`ls` also exist at the top level (`boxd connect <vm>`, `boxd new`, `boxd ls`); `fork` lives under `machine` (`boxd machine fork <vm>`).

## Interactive mode vs. scripts

boxd behaves differently depending on whether it's attached to a terminal:

- **In a terminal**, missing required arguments open a **picker or prompt** instead of erroring (e.g. `boxd machine remove` lists your machines to choose from), and **destructive actions ask for y/N confirmation** instead of requiring `-y`. Running bare `boxd` in a terminal drops into an **interactive REPL** (`boxd (org)>`) where you type the same commands without the `boxd` prefix (`machine ls`, `connect`, …) with full tab-completion; per-line `--org`/`--token`/`--api-url` are rejected there (they're fixed for the session).
- **In a pipe / script / CI** (or with `--json`), there are **no prompts** — a missing required arg is a clean error and destructive commands require `-y/--confirm`. **Agents should always pass every argument explicitly and use `--json`.** Never rely on a prompt in automation.

## Install

```bash
curl -fsSL https://boxd.sh/downloads/install.sh | sh
```

Installs to `~/.local/bin/boxd`. Supports macOS (arm64) and Linux (x86_64, arm64). No sudo needed.

## Auth

```bash
boxd auth login                        # Browser-based device auth (one-time)
boxd auth logout                       # Remove stored credentials
boxd auth                              # Show your identity + the orgs you belong to
```

Credentials are cached locally after `login`. Any command that needs auth will auto-start the login flow if no credentials are found. For non-interactive use (CI, scripts), pass a token:

```bash
boxd --token=TOKEN <command>           # Explicit flag (hidden global)
BOXD_TOKEN=TOKEN boxd <command>        # Env var (same effect)
```

## API keys

Long-lived API keys for CI, scripts, and agent integrations. Created on-demand; the raw value is shown only once at creation time.

```bash
boxd auth keys create NAME                            # mint a new key, raw value to stdout
boxd auth keys create NAME --expires-in-secs=86400    # with expiry
boxd auth keys create NAME --org myorg                # fence the key to a specific org
boxd auth keys create NAME --kind org                 # userless service credential (org admin only)
boxd auth keys list                                   # id, name, prefix, org, kind, created by, last used, expires (alias: ls)
boxd auth keys remove NAME_OR_ID                      # revoke by key name or id (alias: rm)
```

Every key is fenced to ONE org — it never grants account-wide access. Without `--org`, the key is fenced to your active org context. `--kind member` (the default) acts as you within that org; `--kind org` is a userless service credential limited to the org's SHARED machines (requires org admin). An org key keeps working after the person who made it leaves the org, so every admin of the org sees the org's `--kind org` keys in `keys list` and can `keys remove` them; a member key stays visible to its maker only.

`keys create` writes the raw `bxd_...` value to stdout; the warning + id + expiry go to stderr. To put it straight into a GitHub secret:

```bash
KEY=$(boxd auth keys create "gh-actions deploy owner/repo")
gh secret set BOXD_API_KEY --repo owner/repo --body "$KEY"
```

### Key JSON schemas

- `auth keys create --json` → `{"id": str, "api_key": str, "expires_at": int}` (`expires_at: 0` = no expiry)
- `auth keys list --json` → `[{"id", "name", "prefix", "org", "kind", "created_by", "last_used", "expires"}, ...]` (`created_by` is `"you"` for your own keys)

## Global flags

- `--json` — machine-readable JSON output instead of text (only visible global flag besides `--help`)
- `--api-url=URL` / `BOXD_API_URL` — override API server (hidden; persist with `boxd config set api-url`)
- `--token=X` / `BOXD_TOKEN` — auth token, overrides stored credentials (hidden global)
- `--org=NAME` — run in a specific org context (hidden global; persist with `boxd auth switch`)

## Machine lifecycle

```bash
boxd machine new                                    # Create machine, auto-named (~2s boot)
boxd machine new myvm                               # Create with a specific name
boxd machine new --vcpu 1 --memory 4G               # Pick a size: 1 vCPU/4G, 2/8G, 4/16G, or 8/32G (the only supported sizes, up to your org quota; omit for the default; naming one dimension picks its size). Fresh machines only - forks/snapshots keep their source's size
boxd machine new --auto-suspend-timeout=60          # Idle secs before standby (0 = disabled)
boxd machine resize myvm --vcpu 2 --memory 8G -y    # Change to another size (1 vCPU/4G, 2/8G, 4/16G, or 8/32G, up to your org quota). Running: requires -y and reboots to apply (open exec/SSH sessions drop); stopped: applies at next start, no -y needed. Resume/wake standby or hibernated machines first. Confirm with `machine get` (size / vcpu / memory_bytes)
boxd machine new --auto-hibernate-timeout=600       # Idle secs before cold hibernate (0 = disabled)
boxd machine new --auto-destroy-timeout=86400       # Secs after (re)start before the machine is destroyed, irreversibly (0 or omitted = disabled)
boxd machine new --delete-after=2h                  # Delete the machine 2h from now (wall-clock; fires even while it sleeps), or at a cron time: --delete-after="0 18 * * *" (UTC). Irreversible. See "Delete-after" below
boxd machine fork myvm                              # Fork a machine (live: disk + RAM + running processes). Default name: myvm-fork
boxd machine fork myvm --auto-suspend-timeout=60    # Fork also takes the timeout flags
boxd machine new --networks=net-a,net-b             # Networks the machine joins (also on fork; omit = the org default network)
boxd machine new --isolated                         # Sandbox: reachable only via a shared network (also on fork, one-way - can only ADD isolation)
boxd machine networks myvm net-a,net-b              # Change a machine's networks later (--clear reverts to the org default)
boxd machine fork myvm myvm-exp                     # Fork with a specific name (also: machine new --fork myvm)
boxd machine fork shared-vm --shared                # Keep a fork of a shared machine shared (default: private)
boxd machine fork myvm --delete-after=0             # A fork gets a fresh copy of the source's delete-after timer; 0 = none, or pass another duration/cron
boxd machine new --from-snapshot my-workspace       # Create from a snapshot (restores memory+disk, fast)
boxd machine new --team eng                         # Borrow a team's default snapshot as the starting image (name or id). If --from-snapshot is also given, that wins. Doesn't associate the machine with the team.
boxd machine list                                   # List all machines (alias: ls)
boxd machine get myvm                               # Machine details (alias: info)
boxd machine remove myvm --confirm                  # Destroy. Requires --confirm (or -y). Cannot be undone. (alias: rm)
boxd machine rename myvm myvm2 --confirm             # Rename. Requires --confirm (-y): reboots (cold) unless stopped so the new hostname applies. URL/SSH follow immediately.
```

`boxd m ...` is the short alias for `boxd machine ...`. All commands accept `--json`.

Every create path (`new`, `--fork`, `--from-snapshot`) prints the boot/start time and a source (`standalone`, `fork/<origin>`, or `snapshot/<name>`). A boot of `starting` means the machine wasn't ready yet when the command returned (common when creating several at once); poll `machine get NAME --json` for `status: running`.

A fork inherits its source's automations **paused**, so a schedule or webhook is not handled twice. `machine fork` says how many came along; inside the fork, `run jobs` lists them and `run restart <ID>` starts one there.

### State control

Three categories of state transition, all `boxd machine <verb> <machine>`:

```bash
boxd machine start myvm       # start a stopped machine
boxd machine stop myvm        # stop (disk persists; running processes are lost)

boxd machine reboot myvm      # cold reboot (disk persists; running processes are lost)

boxd machine pause myvm       # standby (warm; sub-millisecond resume, preserves memory)
boxd machine resume myvm      # resume a paused machine

boxd machine hibernate myvm   # cold snapshot to disk now (frees host RAM)
boxd machine wake myvm        # wake a hibernated machine
```

- **start / stop / reboot** — lifecycle. Cold: kills the VMM process. Disk persists; running processes and in-memory state are lost. ~2s to come back.
- **pause / resume** — warm standby. Freezes the VMM, keeps memory + running processes + open sockets. Resume is sub-millisecond. Status becomes `standby`. Same mechanism as auto-suspend, user-triggered.
- **hibernate / wake** — cold snapshot to disk, freeing host RAM. A hibernated machine wakes only on a new connection through boxd (HTTPS or SSH, including over the org's tailnet, or `boxd machine exec`), not on a raw exposed port and not on its own cron jobs.

Use `pause` for cost savings without losing state. For a cold kernel/config restart, `stop` then `start`.

### JSON response schemas

- `machine new --json` → `{"name","id","url","source","boot"}`
- `machine fork --json` → the same, plus `"paused_automations"` (how many of the source's automations the fork inherited paused, see below)
- `machine list --json` → `[{"name","status","size","url","source","sharing","ttl","vcpu","memory_bytes","delete_at_ms"}, ...]` (`size` is the compact label, e.g. `2x8G`; use `vcpu`/`memory_bytes`. `ttl` is the delete-after time left, `-` for none; `delete_at_ms` its deadline in unix ms, `0` for none)
- `machine get --json` → `{"name","id","status","size","url","ssh","source","public_ip","auto_suspend","auto_hibernate","delete_after","sharing","domains","networks","isolated","egress","vcpu","memory_bytes"}` (`size` is the label, `vcpu`/`memory_bytes` the numbers; `delete_after` is e.g. `in 1h 59m (…)` or `off`)
- `machine start|stop|hibernate|wake --json` → `{"name","status"}`
- `machine pause --json` → `{"name","status":"standby","suspend_us": int}`
- `machine resume --json` → `{"name","status":"running","resume_us": int}`
- `machine remove --json` → `{"name","status":"destroyed"}`
- `machine resize --json` → `{"name","vcpu","memory_bytes","rebooted"}`
- `manage size --json` → `{"vcpu","memory_bytes","ceiling_vcpu","ceiling_memory_bytes"}`
- `manage backups --json` → `{"enabled","period_secs","retention_secs"}`
- `manage defaults --json` → `{"idle.ignore-outbound": true|false|null, "bot-protection": "on"|"sleep_only"|"off"|null}` (`null` = the org has no default for that key); `manage defaults get <key> --json` → `{"key","value"}`; `manage defaults set <key> <value> --json` → `{"key","value","applied_existing","machines_changed","snapshots_changed","machines_skipped"}`, and for `bot-protection` also `"machines_off"`
- `manage usage --json` → `{"org_id","org","period_start","period_end","currency","rates":{"vcpu_hour_micro","ram_gib_hour_micro","disk_gib_hour_micro"},"total_cost_micro","complete","vms":[{"vm_id","name","owner","owner_name","sharing","status","vcpu","memory_bytes","disk_bytes","running_seconds","standby_seconds","hibernated_seconds","stopped_seconds","vcpu_hours","ram_gib_hours","disk_gib_hours","cost_micro","complete"}, ...]}` (money in micro-units of `currency`, times in unix seconds; `*_hours` are in the rates' units, so cost is roughly hours x rate)
- `machine usage <vm> --json` → one `vms` entry from `manage usage`, plus `"period_start","period_end","currency","rates"`
- `manage billing activity --json` → `{"currency","balance_micro","entries":[{"entry_id","kind","amount_micro","created_at"}, ...],"more"}` (`amount_micro` is signed: charges negative)

`status` values: `running`, `stopped`, `standby`, `hibernated`, `destroying`, `destroyed`, `failed` (plus transitional `starting`/`hibernating`/`rebooting` from the state verbs). `list` and `get` normalize the raw `suspended` state to `standby`. `source` is `standalone`, `fork/<name>`, or `snapshot/<name>:<version>`. `sharing` is `shared` or `private`.

## Snapshots

A snapshot captures a running machine's memory + disk at a moment in time, replicated across a few workers. Create a machine from it near-instantly with `machine new --from-snapshot`.

```bash
boxd snapshots save myvm my-workspace               # Save memory+disk as a named snapshot (machine keeps running)
boxd snapshots list                                 # name, version, status, size, used (alias: ls)
boxd snapshots remove my-workspace -y               # Delete a snapshot and its replicas (alias: rm)
boxd snap save myvm my-workspace                    # `snap` is the short alias
```

Re-saving an existing name captures a new version (latest wins).

Snapshots are fenced to the org context that created them — they never cross an org boundary. `snapshots list` shows the active context's snapshots; switch with `boxd auth switch` to see another org's.

- `snapshots list --json` → `[{"name","version","status","size","used"}, ...]`

## Checkpoints

A checkpoint captures a running machine's memory + disk at a moment in time, held on the machine's own worker and restorable **in place** (the machine reboots into that exact state, same name/URL/ports). Unlike snapshots they are per-machine, not replicated, and never become a reusable image — they live and die with the machine. Use them as quick "save points" before a risky change.

```bash
boxd machine checkpoint save myvm before-migration   # Capture memory+disk (machine keeps running)
boxd machine checkpoint ls myvm                       # name, status, size, created, available (alias for list)
boxd machine checkpoint restore myvm before-migration # Reboot the machine into the checkpoint (-y to skip confirm)
boxd machine checkpoint remove myvm before-migration  # Delete a checkpoint (-y to skip confirm; alias: rm)
```

## Disks

A disk is standalone storage: created independently of any machine, attached to one machine at a time, and outlives whatever it's attached to (unlike a machine's own boot disk). Move it to a different machine later without losing what's on it.

```bash
boxd disks new mydisk --size 10G                    # Create a disk (alias: create)
boxd disks list                                     # id, name, size, status, attached to (alias: ls)
boxd disks attach mydisk myvm --mount-path /mnt/data  # Attach to a machine (--read-only for ro)
boxd disks detach mydisk myvm                       # Detach (contents are kept)
boxd disks remove mydisk -y                         # Delete — must be detached from every machine first (alias: rm)
```

- `disks list --json` → `[{"id","name","size","status","attached_to"}, ...]`

Up to 10 checkpoints per machine. `available: no` means the checkpoint's worker is no longer the machine's worker (e.g. after a migration) — it can't be restored until they line up again.

- `machine checkpoint ls <vm> --json` → `[{"name","status","size","created","available"}, ...]`

## Backups (disaster recovery)

Off by default for the *schedule*, but you can always back up on demand. A backup uploads a machine's disk to object storage; restoring is a **full, destructive disk rewrite** (the machine cold-boots into the restored disk; unlike checkpoints, memory/running state is not restored).

```bash
boxd machine backup now myvm                              # Back up the disk right now, no schedule needed
boxd machine config set myvm backups.period 24h          # Enable a schedule: back up every 24h (also accepts e.g. 12h, 7d)
boxd machine config set myvm backups.retention 30d        # Keep backups for 30 days (default 7d if unset)
boxd machine config set myvm backups.period off           # Disable the schedule
boxd machine backup ls myvm                               # id, status, size, dedup, created, expires
boxd machine backup remove myvm <backup-id>               # Delete one backup (-y to skip confirm; alias: rm)
boxd machine backup restore myvm <backup-id>              # Overwrite the machine's disk with a backup (-y to skip confirm)
```

An on-demand backup uses the schedule's retention if there is one, else the org default, else 7 days.

A backup with no disk changes since the last one records a cheap "dedup" pointer instead of re-uploading; its `dedup` column names the backup it points at. You can't delete a backup another one still points at: delete the newer one first.

- `machine backup ls <vm> --json` → `[{"id","status","size","dedup","created","expires"}, ...]` (humanized strings; `dedup` names the backup a pointer-backup points at, else empty)

## Running commands in a machine

```bash
boxd machine exec myvm -- ls /app                   # Run a command. -- separates machine from cmd
boxd machine exec myvm -- 'cd /app && npm start'    # Shell constructs (pipes, &&, redirects) work
boxd machine exec myvm -e API_KEY=xxx -- env        # Set env vars (repeatable: -e K1=V1 -e K2=V2)
boxd machine exec myvm --timeout 30 -- long-thing   # Kill after N seconds
boxd machine exec myvm --tty -- htop                # Allocate a pseudo-TTY (for interactive tools)
boxd machine exec myvm --json -- CMD                # Capture as {"output": "...", "exit_code": N}
```

The `--` separator is required. Wrap commands containing spaces or shell metacharacters in single quotes.

**Exit codes are forwarded.** If the remote command exits 42, `boxd machine exec` exits 42. Safe to use in pipelines and scripts.

**Stdin IS forwarded** by `machine exec` whenever stdin is not a TTY, so pipes and
redirects work: `cat file | boxd machine exec NAME -- 'tee /path'`. EOF propagates,
which is what lets `claude -p`, `jq` and `tar -xf -` terminate instead of hanging.
`boxd machine cp - NAME:/path` remains the byte-exact upload primitive and is still
preferable for file transfer:

```bash
# Upload a file from stdin
printf 'hello\n' | boxd machine cp - myvm:/home/boxd/greeting
cat data.json | boxd machine cp - myvm:/home/boxd/data.json

# For root-owned destinations, upload to /tmp/ then sudo mv
cat /etc/something | boxd machine cp - myvm:/tmp/something
boxd machine exec myvm -- 'sudo mv /tmp/something /etc/something'
```

### Streaming output for long-running commands

`boxd machine exec` streams stdout live. The trap: when an agent invokes it via
the **foreground Bash tool**, output is buffered and hidden until the
command exits — so a 5-minute install shows nothing for 5 minutes, then
dumps everything at once. The terminal looks frozen.

**Rule**: any `machine exec` step that might take >10s should be invoked
with `run_in_background: true` on the Bash call, then poll its output
file with `Read` (or `Monitor`) to surface progress as the command runs.
Never block the foreground on a long exec.

**Don't pipe through `tail`/`grep`/`head` at the top level.** Streaming
relies on stdout flowing live; `cmd | tail -200` buffers everything
until the command exits. If you want a copy of the log, use `tee`:

```bash
# good: streams live AND saves a log
time npm install 2>&1 | tee /tmp/npm.log

# bad: silent until exit
time npm install 2>&1 | tail -200
```

For multi-step work (installs, builds, deploys), **don't bundle it all
into one exec**. Split into discrete steps so the user sees progress, failures
point at the failing step, and you can retry just that step.

### Passing env vars to commands

```bash
boxd machine exec NAME -e KEY=VALUE -- 'echo "$KEY"'          # single var
boxd machine exec NAME -e A=foo -e B=bar -- 'echo "$A $B"'     # repeatable
boxd machine exec NAME -e PHRASE="hello world" -- '...'       # values with spaces are fine
```

The CLI wraps the command in `env KEY=VAL sh -c '<cmd>'` so `$KEY`
expansion happens in a child shell that inherits the env. Values with shell
metacharacters are shell-quoted and end up as literal text in `$KEY`, never
executed.

### Cloning private GitHub repos

Use the `oauth2:$TOKEN@…` URL form. It works for every token type GitHub issues today, including `gho_` (what `gh auth token` returns):

```bash
git clone "https://oauth2:${GITHUB_TOKEN}@github.com/<owner>/<repo>.git"
```

Don't use the Bearer-header form — it **silently rejects `gho_` tokens**. Don't use `https://x-access-token:$TOKEN@…` either — that fails for `gho_` and `ghp_`.

## File transfer

```bash
boxd machine cp ./local.txt myvm:file               # Upload to /home/boxd/file
boxd machine cp ./config.yaml myvm:/etc/app/config.yaml  # Absolute path
boxd machine cp myvm:file ./local.txt               # Download from /home/boxd/file
boxd machine cp myvm:/var/log/app.log -             # Download to stdout (pipe-friendly)
echo "hello" | boxd machine cp - myvm:greeting      # Upload from stdin
boxd machine cp -r ./dir myvm:dir                   # Recursive (tars on origin, untars on dest)
boxd machine cp --mode 700 ./deploy.sh myvm:deploy.sh  # Set the uploaded file's mode explicitly
```

An upload keeps the local file's mode, so an executable script stays executable
on the machine (recursive copies keep each file's mode via tar). `--mode <octal>`
overrides it for a single-file upload; an upload from stdin has no local mode and
gets the machine's default (644) unless `--mode` is given.

Path rules on the remote side (after `:`):
- Absolute (`/etc/...`) → used as-is
- Tilde (`~/file` or `~`) → expands to `/home/boxd/...`
- Relative (`file`, `subdir/file`) → prefixed with `/home/boxd/`

Max file size: 1 GiB per `cp` on the in-VM path. The laptop CLI streams both directions (uploads above 1 MiB, downloads always) with no byte cap. You cannot copy directly between two machines — download to local first, then upload.

## Connecting interactively

```bash
boxd machine connect myvm                           # Interactive shell in the machine (PTY over the API)
boxd machine ssh myvm                                # `ssh` is the alias for connect
ssh myvm.boxd                                        # Or SSH directly via the ~/.ssh/config alias
```

`machine connect` opens an interactive shell directly (it needs a real terminal; for automation use `machine exec`). The CLI keeps a `<vm>.boxd` host alias (with the per-machine port) in `~/.ssh/config` in sync automatically on every `list`/`new`/`fork`/`remove`/`rename` (and `auth login`; the background service also keeps it fresh) — so `ssh myvm.boxd` and SSH-aware editors (Cursor, VS Code, Zed) work with no extra step.

## Publishing ports

Every machine is live at `https://name.boxd.sh`, forwarding to its default port. Publish more ports as HTTPS subdomains or raw TCP/UDP forwards — all under `machine proxy`.

```bash
boxd machine proxy list                             # All published ports for your machines (alias: ls)
boxd machine proxy list --vm myvm                   # Filter by machine
boxd machine proxy add api --vm myvm --port 3001    # HTTPS subdomain: api.myvm.boxd.sh → 3001
boxd machine proxy add --vm myvm --port 5432 --raw          # Raw TCP forward on an allocated public port
boxd machine proxy add --vm myvm --port 5432 --raw --udp    # UDP instead (add --tcp --udp for both). Max 3 raw ports/machine
boxd machine proxy set-port --vm myvm --port 3000   # Change the default proxy target port
boxd machine proxy set-port --vm myvm --port auto   # Auto-detect listening port (80, 443, 8080, 8000, 3000, 5000, 5173)
boxd machine proxy set-port api --vm myvm --port 4000       # Change a named proxy's port
boxd machine proxy remove api --vm myvm             # Remove a subdomain proxy (alias: rm)
boxd machine proxy remove 5432 --vm myvm            # Remove a raw forward by its machine port
```

`proxy add` for a subdomain waits (up to 90 s) until its HTTPS URL answers: a machine's first subdomain needs a new certificate. `--no-wait` returns at once; `--json` reports `"ready": true|false` (`null` with `--no-wait`).

`--port auto` is only valid for the **default** proxy (omit the name). `proxy list` shows both subdomain proxies (`kind` = `default`/`web`) and raw forwards (`kind` = `tcp`, `udp`, or `udp + tcp`) in one table.

- `machine proxy list --json` → `[{"name","kind","address","port"}, ...]`

## Custom domains

Point your own domain at a machine, or give the whole org a wildcard domain.

```bash
boxd machine domain add app.example.com --vm myvm --confirm   # -y also works
boxd machine domain list                                      # alias: ls
boxd machine domain remove app.example.com                    # alias: rm

boxd manage domain set preview.mysaas.com --confirm   # org-wide, admin only — covers <machine>.preview.mysaas.com
boxd manage domain get                                 # any member can read
boxd manage domain clear                               # admin only
```

Both print the DNS records to add (an A record at the machine's public IP
and a wildcard CNAME at `<machine>.boxd.sh` for `machine domain`, or the NS
records to delegate to boxd's nameservers for `manage domain`) and require
`-y/--confirm` in scripts (interactive terminals get a "press Enter once
you've added them" prompt instead, not a y/N question — there's nothing to
answer no to) — verification starts the moment the command runs, so only
pass it once the records/delegation are actually in place. Checking before
they exist risks a
public DNS resolver caching the "not found" answer, delaying verification
after you do set them. A background check then verifies DNS and issues
certs automatically, then flips `status` to `active`. `machine domain
list`/`manage domain get` show `status` and `last_error`.

## Environment variables & secrets

Persist values into your machines without baking them into images or passing `-e` on every call. Plain vars are cleartext and readable back; `--secret` seals a value at rest (write-only). Both are injected for you — into `machine exec` commands and your SSH/interactive shells (and login shells, via `/etc/profile.d/boxd-env.sh`).

```bash
boxd env set API_BASE https://api.example.com       # create or update a cleartext var
boxd env set OPENAI_KEY sk-... --secret             # create or rotate a sealed secret (never readable back)
boxd env list                                       # NAME / VALUE / SCOPE — secrets show (sealed) (alias: ls)
boxd env remove API_BASE                             # delete (alias: rm; --scope disambiguates in an org context)
boxd env scope OPENAI_KEY shared --from private      # move a secret to another org scope (value preserved)
```

- **plain vs secret.** A plain var is stored and shown in cleartext (`env list` prints the value). A `--secret` var is sealed at rest and **write-only** — there is no command to read it back, and `env list` only shows `(sealed)`. Both inject the same real value into the machine; use `--secret` when you don't want the value sitting in cleartext.
- **Precedence.** A per-command `machine exec -e KEY=VAL` overrides a stored var of the same name. A plain var and a secret can't share the same name **and** scope — last write wins.
- **Scope.** `--scope all|shared|private` only matters after you switch to another org (see Organizations below) and picks which of that org's machines receive the var: `shared` (default) → machines shared with the org, `private` → your private org-billed machines, `all` → both. When you have not switched (your own org, the default context) the scope is always `all` and the flag is ignored. `env scope` takes the new scope as a positional plus an optional `--from <old-scope>` (defaults to `shared`).
- **Names** must be valid POSIX env identifiers; the `BOXD_*` prefix is reserved.
- `env list --json` → `[{"name","value","scope"}, ...]` (`value` is `(sealed)` for secrets).

### Push a local .env file to a machine

`boxd env set` manages **account-wide** vars injected into every machine. To put a literal **.env file** on **one** machine (e.g. the `.env` your app reads from its repo dir), use `env push`. It targets any **existing** machine (make one first with `boxd machine new`):

```bash
boxd env push myvm --file .env --dest ~/myapp/.env  # upload + chmod 600
boxd env push myvm                                  # defaults: --file .env, --dest ~/.env
boxd env push myvm --file .env.production --dest ~/myapp/.env.production
```

- `--dest` defaults to `~/<basename of --file>`; accepts `~`/relative (under `/home/boxd`) or absolute; parent dirs created automatically.
- `--mode` (default `600`) sets the file mode after upload.
- Refuses files with zero `KEY=VALUE` lines unless `--force`.
- `--json` prints `{"vm","dest","vars","bytes","mode"}`.

## Organizations & sharing

If you're a member of an organization, you can switch your working context and share machines with the org. **The org pays for any machine created in its context; sharing it with the whole org is a separate, explicit step** — by default an org machine is private to you.

**Every account works in exactly one org at a time — the active context.** You always belong to at least your own org (created at signup); joining a team adds more. The active context is a **per-device** selection the CLI persists locally (`~/.config/boxd/active_org`) — it is *not* synced to the server, and the web console keeps its own separate selection, so switching in one place does not switch the others. Until you switch, it's your own org.

```bash
boxd auth                               # Show identity + the orgs you belong to (active one marked)
boxd auth switch myorg                  # Switch the active context (multi-word names need no quotes)
# (boxd auth login --continue SESSION completes a sign-in started in the web console - the console shows the exact command)
boxd machine new --shared               # Create a machine shared with the whole org
boxd machine share myvm                 # Share myvm with its org (visible to every member)
boxd machine unshare myvm               # Stop sharing: private to you again, org still pays
boxd manage billing                     # The active org's quota + usage (--open opens the Stripe portal; it only works when you have not switched to another org, other orgs' billing is managed in the console)
boxd manage usage                       # Admin only: each machine's time running/standby/hibernated and cost, last 28 days
boxd manage usage --since 7d            # --since takes 24h / 7d, a UTC date or time (2026-09-01, 2026-09-01T14:30Z) or unix seconds; --until likewise
boxd machine usage myvm                 # Admin only: one machine's usage and cost over its life (a deleted machine is found by name or id too; if several deleted machines shared the name, the error lists their ids)
boxd manage billing activity            # Admin only: what changed the balance, last 28 days, newest first: top-ups, credits, usage summed per day (--since/--until, --limit N, --all; --json lists every entry)
boxd manage size                        # The org's default machine size (any member)
boxd manage size set --vcpu 1 --memory 4G   # Admin only: what new machines get when no size is picked (1 vCPU/4G, 2/8G, 4/16G, or 8/32G)
boxd manage backups                     # The org's default backup schedule (any member)
boxd manage backups set --period 24h --retention 30d   # Admin only: what new machines get unless the machine sets its own schedule
boxd manage backups clear               # Admin only: new machines get no schedule by default
boxd manage defaults                    # The org's defaults for per-machine settings, same keys as `machine config` (any member)
boxd manage defaults set idle.ignore-outbound on   # Admin only: new machines start with it on, also set on the existing machines and snapshots you can manage (yours and shared ones)
boxd manage defaults set idle.ignore-outbound on --new-only   # Admin only: the same, but existing machines keep their own
boxd manage defaults clear idle.ignore-outbound   # Admin only: new machines follow the platform's setting again (off unless changed)
boxd manage defaults set bot-protection sleep_only   # Admin only: the bot protection new machines start with (on, sleep_only or off), also set on your existing machines (off ones stay off)
boxd manage defaults set bot-protection on --new-only   # Admin only: the same, but existing machines keep their own
boxd manage defaults clear bot-protection   # Admin only: new machines follow the platform's setting again
boxd auth org new "My Team"             # Create a new org. You become its owner+admin and active context switches to it
boxd auth org rename "New Name"         # Rename the active org (admin only)
boxd auth org members                   # List the active org's roster + pending invites (invites shown to admins only)
boxd auth org invite dev@example.com --role member   # Admin only: invite by email (also emails the link when configured)
boxd auth org revoke-invite <token>     # Admin only: revoke a pending invite
boxd auth org remove-member <user_id> -y   # Admin only: remove a plain member (owners/admins: use boxd-ctl instead)
boxd auth org set-role <user_id> admin     # Admin only: promote a member to admin, or demote with `member`. Demoting another admin is owner-only; you can always demote yourself. Refused for the org owner
```

## Teams

A team is an org-scoped sub-group of members, with an optional default snapshot new team machines boot from.

```bash
boxd teams new "Engineering"            # Create a team in the active org (org admin/owner only)
boxd teams list                         # Teams you can see: every team for an org admin/owner, else just your own
boxd teams get myteam                   # Roster + default snapshot
boxd teams add-member myteam <user_id>  # Team-admin only; user must already be an org member
boxd teams remove-member myteam <user_id>
boxd teams set-role myteam <user_id> admin
boxd teams set-default-snapshot myteam my-snapshot   # Must be a SHARED snapshot
boxd teams set-default-snapshot myteam --clear        # Clear the default
boxd teams destroy myteam -y
```

Credits-billed orgs (the default for new signups) don't have a Stripe subscription — `boxd manage billing` instead shows the current balance in the org's billing currency (`Credits: €X.YZ` or `Credits: $X.YZ`; `--json` carries `currency`, `balance_micro` and `accruing_micro`). Top up from the web console; the first top-up is doubled, and auto top-up (switched on when a payment method is added; change or disable it under Billing) recharges the org's configured amount (20 by default) once the balance drops below the low-balance threshold (2.50 by default), in that same currency.

Usage costs (`manage usage`, `machine usage`) are estimates at the org's current rates; `manage billing activity` is what was actually charged (one `usage_charge` per 15 minutes for the whole org, plus top-ups and credits). Both are for org owners and admins, and work with an API key issued for the org, but not from inside a machine (there, `boxd machine usage` shows that machine only). Metering lags by up to ~25 minutes: `complete` is `true` on a machine once all its usage in the window is in (it was deleted and has settled, or the window is in the past), and on the org once every machine is. The text output says `(estimated)` until then. To record what a machine cost after deleting it, wait for `complete`.

A machine is born into the org you created it in and never moves between orgs — `share`/`unshare` flip its visibility within that org.

In an org context, `machine new` creates a machine **billed to the org but private to you**; `--shared` makes it visible to the whole org from birth. `machine list` shows a `sharing` column (`shared`/`private`).

When a user asks to **"make a machine public"**, they almost always mean **share it with their whole organization** (`machine share`) — not expose it to the internet (the `*.boxd.sh` URL is already public). It's about which org members can reach the machine.

**Who can do what:**
- **Share / unshare** a machine: the machine's **owner** only.
- **Connect** to a shared machine: any member of the org. A private machine is reachable only by its **owner**.
- **Invite / remove members**: org admin, via `auth org invite` / `auth org remove-member` (owner/admin removal is operator-only — `boxd-ctl`). **Change an existing member's role**: org admin, via `auth org set-role` (demoting another admin: owner only). **Raise the org quota**: operator only, not a `boxd` CLI command. (The org's *default machine size* within the quota IS CLI-settable: `manage size set`, admin only.)

**Sharing a machine wipes its in-VM agent logins.** The moment a machine becomes shared (or is moved back out), boxd deletes the agent credentials inside it — `~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.local/share/opencode/auth.json` — so an owner's personal login isn't left readable to other members. The machine's GitHub token switches to the org's GitHub App token. An agent **running inside** a machine you share is **logged out immediately** — don't share out from under an agent mid-task.

**Forking a shared machine gives you a private fork.** By default `machine new --fork <shared-vm>` creates a fork **private to you** — the org keeps paying but only you can reach it, so your own agent logins work again. Its env vars follow: the fork's login profile is rewritten with your `private` vars and the org's `all` ones, without the `shared`-scoped ones. Processes that were already running when you forked keep the environment they started with. Pass `--shared` to keep the fork visible to the whole org.

## Integrations

Connect an account once and it is available on your machines. OAuth runs as a device flow with no localhost callback, so it works from any terminal:

```bash
boxd manage integrations                                    # List integrations + connection status
boxd manage integrations connect claude                     # Sign in Claude Code on your private machines
boxd manage integrations connect codex                      # Sign in Codex on your private machines
boxd manage integrations connect git                        # Sign in with GitHub: git and gh work on your machines
boxd manage integrations connect github                     # The GitHub account that automations and `run` act as
boxd manage integrations connect linear                     # Any other toolkit: linear, slack, notion, ...
boxd manage integrations connect linear --scope billing     # Share it with the whole org, under a name
boxd manage integrations disconnect linear                  # Remove your own connection
boxd manage integrations disconnect linear --scope billing  # Remove a shared one
```

`claude` and `codex` sign your coding agents in once per org: every private machine you have there is then signed in, and boxd keeps the login fresh. `connect codex` shows a one-time code to enter in the browser. `connect claude` asks you to paste back a code Claude shows you, so it needs a terminal.

`git` and `github` are two separate integrations. `git` is your GitHub sign-in for `git` and the `gh` CLI on your private machines. `github` is the account that automations and the `run` CLI act as. Connect both if you want both.

Press Tab after `connect` to complete the names (`boxd completions --install` sets that up). `connect` with no name lets you pick from the list.

`connect` opens the URL in your browser (and prints it), then waits until you authorize. The credential is exchanged and stored server-side, so the CLI never sees the OAuth secret. To replace a toolkit connection, disconnect it first.

Integrations are fenced to one org and never cross an org boundary. Your own connection serves your private (unshared) machines and your automations in the active org. A toolkit connected with `--scope <name>` is shared with the whole org, and automations pick it by that name. Git on shared machines comes from the org's GitHub App installation, which an admin installs from the console's Integrations page.

On a machine, the same toolkit connections are made with `run auth <toolkit>` and listed with `run list`.

**How the token reaches the machine, and the isolation trade-off.** On a normal machine the connected credentials are delivered through the in-VM metadata endpoint and short-lived on-disk caches (`/run/boxd/*-token`, owner-readable, 5-minute TTL) — so *any code you run in that machine* can use them, including code you don't trust. `boxd machine new --isolated` opts out entirely: an isolated machine has **no metadata endpoint, no in-VM `boxd` CLI, and no integration tokens**. Use `--isolated` whenever the machine runs untrusted code.

## Per-machine settings

Auto-suspend and auto-hibernate timeouts live under `machine config` (backups.period/backups.retention live there too — see "Backups" above).

```bash
boxd machine config list myvm                       # Show all settings for a machine
boxd machine config get myvm auto-suspend.timeout   # Read one setting
boxd machine config set myvm auto-suspend.timeout 0     # Disable auto-suspend
boxd machine config set myvm auto-suspend.timeout 300   # 5 min
boxd machine config set myvm auto-hibernate.timeout 600 # Cold hibernate after 10 min idle
boxd machine config get myvm bot-protection             # Which mode the machine has: on, sleep_only or off
boxd machine config set myvm bot-protection on          # Browser check on every request, running or asleep
boxd machine config set myvm bot-protection sleep_only  # Browser check only when a request would wake it
boxd machine config set myvm bot-protection off         # No browser check at all
boxd machine config set myvm delete-after 2h            # Delete it 2h from now; setting it again replaces the timer
boxd machine config set myvm delete-after "0 18 * * *"  # ...or at the next 18:00 UTC (a cron expression)
boxd machine config set myvm delete-after off           # No timer
```

**Bot protection** has three values. `on`: every HTTPS request to `myvm.<domain>` or `www.myvm.<domain>` must first pass a quick browser check, whether the machine is running or asleep, so crawlers can neither wake it nor keep it awake. `sleep_only`: only a request that would wake a suspended or hibernated machine is checked; while it runs, everything goes straight through. `off`: no check. Non-browser clients (webhooks, API callers, `curl`) can't pass the check, so with `on` they don't reach the machine on those two hostnames: give them a named proxy (`api.myvm.<domain>`) or a custom domain, which are never checked, or use `sleep_only`. Forks and snapshots keep the setting. Don't assume which value a machine has: read it with `machine config get`. An org admin can choose what new machines in the org start with: `boxd manage defaults set bot-protection <value>`. It also changes the existing machines they can manage (their own and the org's shared ones), except machines whose bot protection is off; add `--new-only` to leave existing machines as they are.

You can also set both at creation: `boxd machine new --auto-suspend-timeout=SECS --auto-hibernate-timeout=SECS`. Auto-hibernate defaults to **4 hours** of idle (a fresh machine shows `auto-hibernate: 14400s`); auto-suspend is **off** by default (a fresh machine shows `auto-suspend: off`); a fork inherits its source's setting.

### Auto-suspend (standby) and auto-hibernate

A machine goes to standby or hibernates after its timeout passes with no network traffic in either direction, so a process that calls out every few minutes keeps it awake. CPU work, disk work and local timers don't count, and the machine's own DNS, NTP and DHCP traffic is ignored. With `idle.ignore-outbound` on, only connections opened to the machine count. A hibernated machine wakes only on a new connection through boxd (HTTPS or SSH, including over the org's tailnet, or `boxd machine exec`), not on a raw exposed port and not on its own cron jobs. `boxd machine get myvm` shows the timeouts; 0 (shown as `off`) means it never sleeps.

Machines go into **standby** after N seconds of no TCP/UDP traffic in either direction; outbound traffic (polling, downloads, API calls) resets the idle clock just as inbound does, and the same clock drives auto-hibernate. It is off by default (a fresh machine shows `auto-suspend: off`), and a fork inherits its source's setting; set it per machine at creation with `--auto-suspend-timeout` or later with `machine config set`, and check the effective value with `boxd machine get`. Standby machines consume zero CPU/memory but their disk and IP are preserved. Wake-up from standby is sub-millisecond and fires on the first inbound packet (SSH, HTTP, even a TCP SYN). A hibernated machine has no process left to see a packet: besides the connections above, `boxd machine wake` and a `run` schedule coming due wake it, and a direct connection from another machine over the private network does not. For a background worker that only talks outbound and should sleep between jobs, `machine config set <vm> idle.ignore-outbound on` (or `--idle-ignore-outbound` on `new` / `fork`) makes only connections opened *to* the machine (SSH, HTTPS, another machine) reset the clock and wake it from standby, for auto-suspend and auto-hibernate alike; it applies to a running machine at once, survives fork and snapshot restore, and shows in `boxd machine get` as `idle-ignore-outbound`. An org admin can make it the default for new machines with `manage defaults set idle.ignore-outbound on`, which also sets it on the existing machines and snapshots that admin can manage (their own and shared ones, never another member's private machine); `--new-only` leaves existing machines as they are. With an org default on, `--idle-ignore-outbound=off` on `new` keeps one machine out of it.

**The trap:** CPU-only work without network activity (training runs, encodes, batch jobs, cron without network I/O) looks idle and gets suspended or hibernated mid-work. Clocks freeze while the machine sleeps, so its cron jobs and systemd timers do not fire and do not wake it (`run` schedules do). If a machine needs to keep running, set `auto-suspend.timeout` and `auto-hibernate.timeout` to `0` (above) and verify with `boxd machine get myvm` (shows `auto-suspend: 300s` or `off`, and the same for `auto-hibernate`).

### Auto-destroy

`--auto-destroy-timeout=SECS` (create/fork only, no `machine config set` equivalent) permanently destroys the machine N seconds after it (re)starts running — the timer resets on every restart/wake (from standby or hibernate), it does not track idleness the way auto-suspend/auto-hibernate do. Unlike suspend/hibernate this is **not reversible**. 0 or omitting it disables auto-destroy (the default). Check the effective value with `boxd machine get myvm` (shows `auto-destroy: 86400s` or `off`).

### Delete-after

A **delete-after timer** permanently deletes a machine at a wall-clock deadline, enforced by the platform, so it fires whatever state the machine is in, standby and hibernated included. Prefer it over auto-destroy for throwaway machines: auto-destroy counts from each (re)start and resets on every wake, while a delete-after deadline is fixed until you change it.

- Set it at creation (`--delete-after` on `new` / `fork`) or any time with `machine config set <vm> delete-after <value>`. The value is a duration (`3600`, `90m`, `2h`, `1h30m`, `7d`) or a cron expression whose next match (UTC) is the deadline (`"0 18 * * *"`, `@daily`; anything with a space or starting with `@` is cron). A cron timer fires once, at that match.
- Setting it again **replaces** the timer, so a job can keep extending its own lease; `off` or `0` clears it.
- A **fork** gets a fresh copy of its source's timer, counted from the moment of the fork (a cron timer: its next match after the fork). Pass `--delete-after` on the fork to override it, `0` for none. A snapshot restore starts with none.
- `machine get` shows `delete-after: in 1h 59m (2026-10-05T14:00:00Z)` (plus `cron "…"` if set by cron), and `machine list` has a `TTL` column. Deletion happens within ~15s of the deadline.
- Only set or shorten a timer when the user asked for the machine to go away: deletion is permanent, disk included.

## CLI settings

`boxd config` persists laptop-side CLI settings.

```bash
boxd config list                        # api-url, client-utils.enable, daemon.enable
boxd config get api-url                 # Read one
boxd config set api-url https://boxd.sh # Persist the API server (flag/env still override)
boxd config set client-utils.enable true    # Enable the clipboard/files/browser bridge for this device
boxd config set client-utils.enable false   # ...and disable the bridge (daemon keeps running in thin mode)
boxd config set daemon.enable false     # Stop + remove the background service entirely
```

A small per-user background service keeps `~/.ssh/config` machine aliases fresh (thin mode - on by default). `client-utils.enable` additionally lets tools inside your machines reach this device (clipboard, files, browser); turning it off drops that bridge but keeps the thin service. `daemon.enable false` removes the service entirely.

## Delegating work to in-VM agents

Start Claude Code inside a machine non-interactively. Capture the session ID for follow-ups.

> Always redirect stdin with `< /dev/null` when launching `claude -p` via `machine exec`. Otherwise Claude waits 3s for stdin context and prints a warning before proceeding.

```bash
# Start a task — capture session ID
RESULT=$(boxd machine exec myvm -- 'claude -p --output-format json "Build a Flask API on port 8000" --dangerously-skip-permissions < /dev/null 2>/dev/null')
SESSION_ID=$(echo "$RESULT" | jq -r .session_id)

# Follow up on the same session (preserves conversation context)
boxd machine exec myvm -- "claude -p --resume $SESSION_ID \"Add a /health endpoint\" --dangerously-skip-permissions < /dev/null"

# User can resume interactively
ssh myvm.boxd
claude --resume <session_id>
```

Session data persists on the machine's disk across reboots and standby.

### Multi-machine parallel delegation

```bash
boxd machine new task-1 --json
boxd machine new task-2 --json
boxd machine new task-3 --json

# Fan out
boxd machine exec task-1 -- 'claude -p --output-format json "Build auth service" --dangerously-skip-permissions < /dev/null' &
boxd machine exec task-2 -- 'claude -p --output-format json "Build payments API" --dangerously-skip-permissions < /dev/null' &
boxd machine exec task-3 -- 'claude -p --output-format json "Build dashboard" --dangerously-skip-permissions < /dev/null' &
wait

# Each machine is live at https://task-N.boxd.sh
```

## Common workflows

### Deploy a web app

```bash
boxd machine new myapp --json
boxd machine cp -r ./myproject myapp:/home/boxd/myproject
boxd machine exec myapp -- 'cd /home/boxd/myproject && pip install -r requirements.txt'
boxd machine exec myapp -- 'cd /home/boxd/myproject && nohup python app.py >/tmp/app.log 2>&1 &'
boxd machine proxy set-port --vm myapp --port 8000
# Live at https://myapp.boxd.sh
```

### Fork for safe experimentation

```bash
boxd machine new myapp-experiment --fork myapp --json
boxd machine exec myapp-experiment -- 'cd /home/boxd/myproject && git checkout feature-branch'
# Test at https://myapp-experiment.boxd.sh
# Keep it or: boxd machine remove myapp-experiment -y
```

### Throwaway machines: delete when the task is done

For fork → run → delete pipelines, give the machine a delete-after timer as a safety net, then have the job delete its own machine as its last step. Self-delete runs **inside** the machine with the in-VM CLI (`boxd machine remove --self`, which always asks y/N, so a script answers it explicitly), or the SDKs' `machines.delete_self(confirm="<its name>")`. From the laptop there is no "self": deleting is `boxd machine remove <vm> -y`.

```bash
boxd machine fork base job-42 --delete-after 2h --auto-suspend-timeout 0 --json   # safety net; 0 keeps a long batch job awake if the source had auto-suspend on
boxd machine cp ./job.sh job-42:/home/boxd/job.sh
boxd machine exec job-42 -- 'chmod +x /home/boxd/job.sh && nohup /home/boxd/job.sh > /home/boxd/job.log 2>&1 &'
# job.sh ends with:  <ship results out> && echo y | boxd machine remove --self
```

`remove --self` returns before the machine shuts down (~2s later), so it can be the script's last line; ship results out (`boxd machine cp` to another machine, git, an upload) **before** it, since the disk goes with the machine. If the job hangs or dies first, the delete-after timer still deletes the machine. Self-delete is refused on machines shared with the org.

### Debug a crashed service

```bash
boxd machine get myapp                              # Is it running or standby?
boxd machine exec myapp -- 'sudo journalctl -u myapp --since "10 min ago"'
boxd machine exec myapp -- 'ss -tlnp | grep 8000'   # Anything listening?
boxd machine exec myapp -- 'curl -s http://localhost:8000'  # Test locally inside the machine
boxd machine proxy list --vm myapp                  # Is the proxy pointed at the right port?
```

## Shell completions

Tab-completes commands, flags, and your machine/snapshot/org/proxy/key names (fetched live, so `boxd machine connect <TAB>` lists your machines). Set up automatically for zsh/bash/fish by the installer and on `boxd auth login`; to set up manually:

```bash
boxd completions --install        # auto-detects your shell, idempotent
boxd completions zsh              # or: print the raw script yourself
```

## Environment notes

Machines run Ubuntu 24.04. Pre-installed: Docker (no sudo), Python 3 (with uv, pipx), Node.js 24 (via nvm; `node`/`npm`/`npx` are symlinked into `/usr/local/bin` so they also resolve under `machine exec`), Go, git, curl, jq, ripgrep, gh, ffmpeg, headless Chrome, nginx (on port 8000, disabled), Claude Code (`claude`), Codex (`codex`). Per-machine: the size picked at create - 1 vCPU / 4 GB, 2 vCPU / 8 GB, 4 vCPU / 16 GB, or 8 vCPU / 32 GB (fixed for the machine's life; `machine resize` changes it) - plus 100 GB copy-on-write disk. Max 50 machines per org by default (every org has its own cap, including the one created at signup; brand-new orgs without a payment method are capped at 2 until one is added).

## References

- Full docs: https://docs.boxd.sh
- Complete agent reference: https://docs.boxd.sh/llms-full.txt
