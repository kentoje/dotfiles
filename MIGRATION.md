# Migration: move `$HOME` back to `/Users/kento`, keep bulk data on `/Volumes/HomeX`

> **Status (last verified 2026-07-11):** IN PROGRESS — Phase 1 only, partially done.
> `~58 G` of Phase-1 reclaim executed (Docker prune, Rewind removed, pnpm prune).
> The switch itself has **NOT** started: `$HOME` is still `/Volumes/HomeX/kento`,
> `flake.nix:290` still `home = "/Volumes/HomeX/kento"`, and `/Users/kento` does not exist.
> No new work since the last update — every remaining Phase-1 trim/relocate item is still pending.
> Read the whole file once before running a single command.
> Touchy / dangerous operations are flagged with **⚠️**. Do those manually, slowly, one at a time.

---

## 1. Goal & end state

**Today:** the entire home directory lives on an external SSD.
- `$HOME = /Volumes/HomeX/kento`
- Set by nix-darwin via `users.users.kento.home` in `.config/nix-darwin-mini/flake.nix`, which writes the account's `NFSHomeDirectory` record.
- The `HomeX` APFS volume lives on an **external** WD_BLACK SN770 1TB, auto-mounted at `/Volumes/HomeX` with the `noowners` flag (device node currently enumerates as `/dev/disk5s1`; it drifts across reconnects, so match by volume name, not disk number).

**Target:** a normal internal home, with only bulk data left external.
- `$HOME = /Users/kento` (on the internal APFS Data volume).
- Light, fast, always-available content lives internally: dotfiles, `.config`, dev toolchains, `~/Library` (after trimming), small caches.
- Heavy/bulk content stays on `/Volumes/HomeX` and is reattached into `~` via **symlinks**: `Documents`, model stores, etc.
- The launchd plist-copy workaround in `flake.nix` is **deleted** (it only exists because launchd refuses `/Volumes` homes).

---

## 2. Pre-flight facts (measured on this machine)

### Disk space — THE BINDING CONSTRAINT (re-measured 2026-07-11)
- Internal Data volume (`/System/Volumes/Data`): **229 G total, ~81 G free** (149 G used). Was ~92 G free when the plan was first written; internal use has crept up.
- External `HomeX` volume: **341 G used of 932 G, ~591 G free.**

### Home size breakdown (top-level)
| Dir | Size | Destination |
|---|---|---|
| `Library` | ~~175 G~~ → **130 G** (measured) | internal — **but only after further trimming** (does NOT fit as-is) |
| `Documents` | ~~116 G~~ → **141 G** (grew) | **external** (symlink) |
| `.lmstudio` | 16 G | external (LM Studio model store) |
| `.npm` | 14 G | internal (or prune) |
| `.local` | 12 G | internal |
| `.ollama` | 6.5 G | external (Ollama model store) |
| `.bun` | 5.7 G | internal |
| `.claude` | 4.6 G | internal |
| `.Trash` | ~~3.4 G~~ → **11 G** (grew) | **empty before migrating** |
| `.rustup` | 2.9 G | internal |
| `.cache` | 2.9 G | internal (or skip; regenerates) |
| `.paseo` | 1.8 G | internal |
| `go` | 1.3 G | internal |
| `.cargo` | 0.7 G | internal |
| `Downloads` | 692 M | internal or external |
| `dotfiles` | 281 M | internal |
| `Pictures` | 189 M | internal (screenshots land here) |
| `.codex` / `.cursor` | ~360 M | internal |

**Math check:** internal-bound content ≈ `Library` (now 130 G, untrimmed) + dev toolchains/caches (~45 G) ≈ **175 G** into **81 G free**. Still impossible until `Library` is trimmed further. **Resolving `Library` is step 4 and gates everything.**

### Hardcoded `/Volumes/HomeX/kento` paths in `~/dotfiles` (audited 2026-07-11)

**Good news — the login path is safe.** The shell entrypoints that run at every login are all `$HOME`-relative and will NOT break the flip:
- `.zshenv`, `.zprofile`, `.zshrc` — 100% `$HOME`/`~`-relative. Clean.
- `.config/fish/config.fish` — structure is `~`-relative; the pnpm block (L57-61) already branches on `if string match -q "/Volumes*" $HOME`, so it is migration-aware. A dead `fish_add_path` entry does not abort shell startup.

**🔴 CRITICAL — `flake.nix` (system rebuild + launchd agents). Handle exactly per Phase 3/4:**
- L290 `home = "/Volumes/HomeX/kento";` — the flip itself (Phase 3b).
- L104 `screencapture.location = "/Volumes/HomeX/kento/Pictures/screenshots";` — repoint to `/Users/kento/...`.
- L149-191 launchd plist-copy block (sketchybar L158, agent-gossips L172, agent-gossips-daemon L174) — copies plists FROM `/Volumes/HomeX/kento/Library/LaunchAgents`. ⚠️ If the external drive is unmounted during a rebuild, these `cp`/`bootstrap` steps fail the activation script. This is the obsolete hack; remove in Phase 4 AFTER the flip is proven, not in the same rebuild.
- L240 `WorkingDirectory = ".../Documents/github/kentoje/agent-gossips"` — under `Documents`, which stays external (symlinked); resolves only while the drive is mounted.
- L248 `/Volumes/HomeX/kento/.bun/bin/bun run ...` — `.bun` moves internal → repoint to `/Users/kento/.bun/bin/bun` (or `$HOME`).
- L267 `exec /Volumes/HomeX/kento/dotfiles/.config/sketchybar/scripts/agent-gossips-daemon.sh` — `dotfiles` moves internal → repoint.

**🟠 MEDIUM — Claude Code tooling (not login-breaking):**
- `.claude/settings.json` L121 — `command: node /Volumes/HomeX/kento/.claude/plugins/cache/.../pretooluse.mjs`. `.claude` moves internal, so this hardcoded hook path breaks the context-mode PreToolUse hook after the flip. Repoint to `/Users/kento/...` (or `$HOME`). The `context-mode-cache-heal.mjs` hook already resolves via `homedir()`, so it is fine.

**🟡 LOW — dead PATH entries in `config.fish` (harmless, tidy in Phase 4):**
- L69 `fish_add_path /Volumes/HomeX/kento/.codeium/windsurf/bin`
- L84 `fish_add_path /Volumes/HomeX/kento/.opencode/bin`
- L102 `set -gx PATH $PATH /Volumes/HomeX/kento/.lmstudio/bin` (`.lmstudio` stays external/symlinked; prefer `~/.lmstudio/bin`)

**Other real configs to rewrite:**
- `.config/cursor/settings.json` (custom-css import), `.config/ralph/config.json` (`ralph_home`), `.config/sketchybar/plugins/agent-gossips.sh` + `claude_sessions.sh` (`CONFIG_DIR`).
- `.gitconfig` L12 — `[safe] directory = /Volumes/HomeX/kento/dotfiles`. ⚠️ The external volume is `noowners`; this entry currently silences git's dubious-ownership check. Repoint to `/Users/kento/dotfiles`.
- `.config/herdr/plugins.json` L8-9 — `manifest_path` + `plugin_root` of the vim-nav plugin (real registration, not transient). Repoint to `/Users/kento/...`.
- `.config/solana/install/config.yml` L39-40 — `releases_dir` / `active_release_dir`; `.local` moves internal. Repoint (solana may later rewrite it on `solana-install`).
- `.config/nvim/lua/plugins/obsidian.lua` — **already migration-aware** (branches on `has_home_with_volumes`); no change needed.

**Verified-complete inventory (2026-07-11):** a full `os.walk` of `~/dotfiles` (not the capped `fff` scan) confirms the above is the entire set of functional configs. The fish `includes/*.fish` (incl. `private-vars.fish`) have **zero** hardcoded paths, so the login shell is proven safe.

Ignore — transient/regenerating or non-functional: `lazygit/state.yml`, `uv/uv-receipt.json`, `fish/fish_variables`, `fish/fishd.tmp.*`, `herdr/*.log`, `herdr/session.json`, `cointop/config.toml` (cache dir), `flipperdevices.com/qFlipper.ini` (UI last-folder state), `opencode/prompts/DELEG_ORCHESTRATOR.md` (example text in a prompt), `.crush/crush.db-wal` (binary agent-session DB).

> **Scope boundary:** this audit covers the `~/dotfiles` repo only. Hardcoded `/Volumes/HomeX` paths baked into *installed* app preferences or non-nix launchd agents **outside** the repo are not covered here — they won't break login, but individual apps may point at the old location post-flip until re-set.

---

## 3. Phase 0 — Backups & safety net (do this first, no exceptions)

> ⚠️ The whole migration hinges on not losing data while two homes exist temporarily. Build the safety net before touching anything.

1. **Time Machine / full backup.** Confirm a recent successful backup of `/Volumes/HomeX/kento`. If you have no backup, stop and make one.

2. **Snapshot the dotfiles repo.** Commit or stash any work in `/Volumes/HomeX/kento/dotfiles` so the repo is clean and recoverable:
   ```fish
   cd /Volumes/HomeX/kento/dotfiles
   git status
   git add -A; git commit -m "checkpoint before HOME migration"   # or stash
   ```

3. **Record the current account record** (so you can roll back exactly):
   ```fish
   dscl . -read /Users/kento NFSHomeDirectory > ~/Desktop/home-migration-backup.txt
   diskutil info /Volumes/HomeX >> ~/Desktop/home-migration-backup.txt
   id kento >> ~/Desktop/home-migration-backup.txt
   ```
   Copy that file somewhere OFF the external drive (e.g. iCloud Desktop, or print it).

4. **Have a second admin account or recovery path.** If login breaks mid-migration you need a way back in. Confirm you know the FileVault/admin password and that a second local admin user exists (System Settings → Users & Groups). Optionally enable SSH so you can fix things from another machine.

5. **Keep the external drive plugged in and powered the entire time.**

---

## 4. Phase 1 — Resolve the `Library` blocker (trim + relocate)

> **AUDITED — decision made: PATH A.** The 175 G `Library` is dominated by reclaimable
> caches and relocatable VM/game bulk, not genuinely-needed internal app data. After
> trimming, the internal Library footprint is ~50 G (or ~22 G if Steam + MemoryVault also
> go external) — fits the 92 G free with headroom. **Path B (§7) is not needed.**

> **✅ PROGRESS — ~58 G already reclaimed (executed):**
> - Docker pruned: `com.docker.docker` **38 G → 2.6 G** (32.9 GB logical; `Docker.raw` auto-shrank). Images & build cache now 0; 2 unused 96 MB volumes left intact.
> - Rewind removed entirely: app + data + caches + HTTPStorages + logs + prefs deleted (**16 G**, permanent; no launchd leftovers).
> - pnpm pruned: store **13 G → 5.6 G** (removed 299,333 files / 9,593 packages).
>
> External `HomeX` volume now: **622 G free**. Remaining big movers: UTM + Steam (relocate).
>
> **✅ PROGRESS 2 — 2026-07-11 session (~31 G more reclaimed, external):**
> - `Library/Caches` **37 G → 9.2 G** — deleted regenerable package/browser/media caches (Yarn 11 G, Spotify 5.2 G, Helium/Arc/Vivaldi, Cypress, pnpm/pip/node-gyp/typescript, electron, ledger, Raspberry Pi). **Preserved** `claude-cli-nodejs` (3 G, running agent) + `ms-playwright` (2.7 G, active e2e workflow).
> - Xcode `DerivedData` **2.6 G → 0**; unavailable simulators removed.
> - `Library` now ≈ **99 G**. ⚠️ Caches live on the external volume while `$HOME` is external, so this frees *external* space (reduces the future internal copy), not internal free yet.
> - `.Trash` (11 G) **NOT emptied** — inspection found personal/financial files (payslips, payroll PDFs, CV, work docs). Held pending a backup + manual review (see §6a).
>
> **⛔ GATES NOT MET (blocks the flip):** no full backup yet, and no recovery path (second admin / FileVault password) confirmed. Phase 3 must not start until both exist (§3.1, §3.4).

### 4a. Measured `Library` map (depth-2 of the heavyweights)
| Subdir | Size | Disposition |
|---|---|---|
| `Containers/com.docker.docker` | ~~38 G~~ → **2.6 G** | ✅ **DONE** — pruned (`docker system prune -a -f`) |
| `Containers/com.utmapp.UTM` | 32 G | **RELOCATE external** — UTM VM images (real bulk) ⚠️ sandboxed |
| `Containers/*` (Slack, Safari, Apple…) | ~4 G | keep internal (small) |
| `Application Support/com.memoryvault.MemoryVault` | ~~16 G~~ → **0** | ✅ **DONE** — Rewind removed entirely (permanent) |
| `Application Support/Steam` | 11 G | **RELOCATE external** or delete games |
| `Application Support/Claude` | 6.3 G | trim cache portion; keep rest internal |
| `Application Support/Arc` | 4.8 G | mostly reclaimable browser cache |
| `Application Support/*` (Cursor, Zed, Figma, Spotify…) | <1 G each | keep internal |
| `Caches` | ~~35 G → 37 G~~ → **9.2 G** | ✅ **DONE** — regenerable caches deleted (kept claude-cli + ms-playwright) |
| `pnpm` | ~~13 G~~ → **5.6 G** | ✅ **DONE** — `pnpm store prune` |
| `Developer` | ~~7.7 G~~ → DerivedData **0**, CoreSimulator 5.1 G | ✅ **DONE** — DerivedData cleared + unavailable sims removed |
| everything else (`Preferences`, `Keychains`, `Fonts`, `Messages`…) | <3.5 G total | keep internal |

**Budget:** ~58 G already reclaimed (Docker + Rewind + pnpm). `Library` measured **130 G** on 2026-07-11.
Remaining: reclaim Caches (37) + Developer (7.7) ≈ **45 G**; relocate UTM (32) → Library internal ≈ **~53 G**. Optionally externalize Steam (11) → ≈ **~42 G**. Fits 81 G free, with less margin than before — trim Caches + Developer + relocate UTM before the move.

### 4b. Trim the reclaimable bulk
> ⚠️ Use each tool's *correct* reset path — prefer the app's own purge over `rm -rf`. Close the app first.

- ✅ **Docker (38 G → 2.6 G) — DONE.** Ran `docker system prune -a -f` (no `--volumes`, to spare the 2 unused 96 MB local volumes). `Docker.raw` auto-shrank. Images/build cache now 0.
- ✅ **Caches (37 G → 9.2 G) — DONE (2026-07-11).** Deleted regenerable caches directly (apps not closed; HTTP/package caches rebuild safely). **Preserved** `claude-cli-nodejs` (running agent) + `ms-playwright` (active e2e). To finish later, the remaining 9.2 G can go once those aren't in use.
- ✅ **pnpm (13 G → 5.6 G) — DONE.** Ran `pnpm store prune` (removed 299,333 files / 9,593 packages). Store dir: `Library/pnpm/store/v10`.
- ✅ **Xcode Developer — DONE (2026-07-11).** Cleared `DerivedData` (2.6 G → 0), `xcrun simctl delete unavailable`, then **`xcrun simctl delete all`** — removed all 26 simulator devices, `CoreSimulator/Devices` **5.1 G → 4 K** (Xcode recreates on demand).
- ✅ **Round-2 caches — DONE (2026-07-11):** `npm cache clean` (13 G) + `_npx` (1.9 G), `uv cache clean` (1.7 G), `.cache` cleared (2.9 G), `.bun/install/cache` (5.1 G), `go clean -cache -modcache` (1.3 G).
- **Arc / Claude App Support caches:** further trim via the app if needed (holds real profile/state too). *(optional, not done)*

### 4c. Relocate the real bulk to external (NOT trimmed — moved & re-pointed)
> ⚠️ These are sandboxed-app data and real VM/game files. Do NOT blind-symlink a sandbox `Containers/*` dir — sandbox + TCC can break the app. Use each app's own "storage location" setting.

- **UTM VMs (32 G) — IN PROGRESS (2026-07-11).**
  - ✅ **Clones made** to the stable external target `/Volumes/HomeX/kento/VMs/` via APFS clonefile (`/bin/cp -Rc`, instant, no extra space until divergence): `Kali.utm` (24 G), `Linux.utm` (5.6 G), `Metasploitable2.utm` (2.2 G). Integrity verified (each has `config.plist` + `Data/*.qcow2` + `efi_vars.fd`). Originals still in the container → **two copies exist**, so the move is now loss-safe.
  - `utmctl` has **no import** subcommand, so re-registration is a GUI step. **Pending user (GUI):** in UTM, `Delete → Move to Trash` the 3 container VMs (recoverable from Trash), then double-click each `.utm` in `/Volumes/HomeX/kento/VMs/` to re-add at the new path, and boot each to confirm.
  - After boot-verify: the container's `Data/Documents` is emptied (32 G no longer inside `Library` → won't copy to internal). ⚠️ Post-flip, confirm UTM's security-scoped bookmarks still resolve to `/Volumes/HomeX/kento/VMs/` (re-add via double-click if not) — added to §8 checklist.
  - Do NOT symlink `com.utmapp.UTM` (sandbox/TCC breakage).
- ✅ **Steam (11 G) — DONE (2026-07-11).** Uninstalled the only game (Neverwinter Nights, 9 G) — deleted `steamapps/common/Neverwinter Nights` + `appmanifest_704450.acf` (re-downloadable via Steam). Steam client (~2 G) stays internal.
- ✅ **MemoryVault / Rewind.app (16 G) — DONE (removed, not relocated).** Decision changed from relocate → remove. Deleted the app (`/Applications/Rewind.app`) and all data: `Application Support/com.memoryvault.MemoryVault`, `Caches/com.memoryvault.MemoryVault`, `HTTPStorages/com.memoryvault.MemoryVault`, `Logs/Rewind`, `Preferences/com.memoryvault.MemoryVault.plist`. Permanent — the recording archive is gone. No LaunchAgents/launchd services existed.

### 4d. Re-measure and confirm before proceeding
```fish
du -sh /Volumes/HomeX/kento/Library 2>/dev/null   # was 175 G; measured 130 G on 2026-07-11 (post Docker+Rewind+pnpm)
df -h /System/Volumes/Data    # confirm projected internal footprint leaves ≥20 G free
```
**Remaining Phase-1 work before the move (all still pending as of 2026-07-11):** empty `Caches` (37 G), prune Xcode `Developer` (7.7 G), relocate UTM VMs (32 G) — and optionally Steam (11 G). After those, internal-bound `Library` ≈ 42–53 G. Proceed to Phase 2 once it + dev toolchains comfortably fit the **81 G free** with headroom. (Fits, but the margin is tighter than the original 92 G — do the reclaim + UTM relocate before flipping.)

---

## 5. Phase 2 — Decide the layout & write the symlink map

**DECIDED (2026-07-11).** Split below closes the disk gap to ~65 G internal (~21 G headroom).

**Internal (`/Users/kento/…`, copied):**
`dotfiles`, `.config`, `.claude`, `.codex`, `.cursor`, `.bun`, `.rustup`, `.cargo`, `go`, `.npm`, `.local/bin`, `.local/state`, `.paseo`, `.cache`, `Library` (trimmed), `Pictures`, `Downloads`.

**External (`/Volumes/HomeX/kento/…`, symlinked from `~`):**
`Documents` → `~/Documents`
`.lmstudio` → `~/.lmstudio`
`.ollama` → `~/.ollama`
**`.local/share` → `~/.local/share`** — 14 G of toolchain data (fnm, uv, nvim, opencode, claude, yarn). Not latency-sensitive; reads from the fast external SSD. `.local/bin` + `.local/state` stay **internal** so PATH binaries survive an unplugged drive.
`VMs/` stays external (UTM points at `/Volumes/HomeX/kento/VMs/` directly — no `~` symlink needed).

> ⚠️ With `.local/share` external, unplugging the drive degrades dev tooling (mason bins, fnm node versions) but does NOT break login or the base shell (`.local/bin`/`.config`/`.claude` are internal). Keep the drive attached in normal use.

> Decide per-tool whether a symlink or a native config option is better. Many tools (Ollama `OLLAMA_MODELS`, LM Studio model dir setting) prefer an env var / setting over a symlink. Env var > symlink where supported.

---

## 6. Phase 3 — Execute the switch (the touchy core)

> ⚠️ This is the irreversible-feeling part. Go slowly. Do it when you have a free evening, not before a meeting.

### 6a. Empty the Trash on the external drive
> ⚠️ **HELD (2026-07-11).** Inspection found real personal/financial files in `.Trash` (payslips, payroll PDFs, a CV, work docs), 11 G total. **Do not blind-`rm`.** Review the contents and recover anything wanted FIRST, and only empty once a full backup exists (§3.1).
```fish
ls -la /Volumes/HomeX/kento/.Trash        # review before deleting
rm -rf /Volumes/HomeX/kento/.Trash/*      # reclaim ~11 G; only after backup + review
```

### 6b. Flip the home directory in nix-darwin
Apply **only** the prepared flip patch (see §8) — it changes just the one line:
```fish
git apply migration/phase3b-flip-home.patch    # flake.nix: home = "/Users/kento";
```
> ⚠️ Do NOT also touch the **launchd plist-copy block** or the other hardcoded paths in this rebuild. Once home is `/Users`, that hack is obsolete — but removing it in the *same* rebuild as the home flip strips your fallback. Flip home first (this patch), rebuild, relogin; the full hack-removal + path repoint is a separate rebuild driven by `phase4-cleanup.patch` in Phase 4. (See §8 for the exact two-rebuild sequence and why a green `launchctl list` before Phase 4 can be a false positive.)

> ⚠️ Do NOT `darwin-rebuild switch` yet if the rebuild itself runs activation scripts that touch the home path. Read the activation block first. If unsure, populate `/Users/kento` (6c) BEFORE the rebuild so the directory exists when activation runs.

### 6c. Pre-create and populate `/Users/kento` BEFORE relogin
> The new home must exist and be owned by `kento` before you log into it, or macOS may create a fresh empty home or refuse login.

```fish
# create the dir (needs sudo; /Users is root-owned)
sudo mkdir -p /Users/kento
sudo chown kento:staff /Users/kento

# copy the INTERNAL-bound content. rsync, preserve attrs, do NOT delete, dry-run FIRST.
# ⚠️ run each with -n (dry run) first, inspect, then run for real without -n.
rsync -aAXH -n  /Volumes/HomeX/kento/dotfiles      /Users/kento/
rsync -aAXH -n  /Volumes/HomeX/kento/.config       /Users/kento/
rsync -aAXH -n  /Volumes/HomeX/kento/Library       /Users/kento/    # large; trimmed in Phase 1
# ...repeat for each internal-bound dir from §5...

# ⚠️ .local is SPLIT: copy bin+state internal, but EXCLUDE share (it stays external, symlinked in 6d)
rsync -aAXH -n --exclude 'share' /Volumes/HomeX/kento/.local  /Users/kento/
```
> ⚠️ `noowners` is set on the external volume, so ownership on the source is unreliable. After copying, fix ownership on the destination:
> ```fish
> sudo chown -R kento:staff /Users/kento
> ```

### 6d. Create the symlinks for external bulk
```fish
ln -s /Volumes/HomeX/kento/Documents      /Users/kento/Documents
ln -s /Volumes/HomeX/kento/.lmstudio      /Users/kento/.lmstudio
ln -s /Volumes/HomeX/kento/.ollama        /Users/kento/.ollama
# .local/share stays external (6c excluded it from the copy):
ln -s /Volumes/HomeX/kento/.local/share   /Users/kento/.local/share
# verify each: readlink -f /Users/kento/Documents ; readlink -f /Users/kento/.local/share
```

### 6e. Apply the rebuild and relogin
```fish
cd /Users/kento/dotfiles/.config/nix-darwin-mini
darwin-rebuild switch --flake .
dscl . -read /Users/kento NFSHomeDirectory   # must now read /Users/kento
```
Then **log out and back in** (or reboot). Open a fresh terminal:
```fish
echo $HOME    # expect /Users/kento
pwd           # a fresh shell should start in /Users/kento
```

> ⚠️ If login fails or drops to a broken session: log into the second admin account (or SSH in) and restore the original record from your backup:
> ```fish
> sudo dscl . -create /Users/kento NFSHomeDirectory /Volumes/HomeX/kento
> ```
> Then reboot. You are back to the original state.

---

## 7. Path B fallback — if `Library` could not be trimmed

> **NOT NEEDED for this machine** — the Phase 1 audit confirmed Path A fits with wide margin.
> Documented only as a contingency if the trim/relocate in Phase 1 somehow under-delivers.
> This path is fragile; avoid if at all possible.

- Keep `~/Library` on the external volume, but keep **`~/Library/LaunchAgents` internal and real** (launchd cannot load agents from `/Volumes`).
- Approach: symlink `~/Library` → `/Volumes/HomeX/kento/Library`, but that makes `LaunchAgents` external too → breaks launchd. So instead symlink the *large subdirectories* individually (`Containers`, `Caches`, `Developer`, `Application Support`) to external, leaving the rest of `~/Library` (including `LaunchAgents`, `Preferences`) internal.
- ⚠️ Symlinking inside `~/Library` is poorly supported by some Apple frameworks (sandboxed apps, `Containers`, TCC/privacy DB). Expect odd permission prompts and possible app breakage. Test app-by-app.
- This is why trimming Library to fit internally (Path A) is strongly preferred.

---

## 8. Phase 4 — Cleanup & verification

> **Two prepared patches drive Phases 3b + 4.** Both were generated with `difflib` against
> the pristine tree and verified with `git apply --check` (clean individually AND together,
> either order). They live in the repo at `migration/`:
> - `migration/phase3b-flip-home.patch` — 1 hunk: `flake.nix` `home = "/Users/kento"` only. **Applied in Phase 3b, not here.**
> - `migration/phase4-cleanup.patch` — 10 files: removes the launchd hack + repoints every remaining path (`flake.nix` screencapture/WorkingDirectory/bun/daemon, `.claude/settings.json`, `cursor`, `ralph`, both sketchybar plugins, `config.fish`, `.gitconfig`, `herdr/plugins.json`, `solana/install/config.yml`).
>
> **Split on purpose:** never flip home AND remove the launchd hack in the same rebuild (§6b). `obsidian.lua` needs no change (already branches on `has_home_with_volumes`).

### The two-rebuild sequence
```fish
cd /Users/kento/dotfiles          # after Phases 0-3 have populated the new home

# --- Phase 3b: flip only, then rebuild + relogin ---
git apply migration/phase3b-flip-home.patch
darwin-rebuild switch --flake .config/nix-darwin-mini
# log out / back in, confirm: echo $HOME  ->  /Users/kento

# --- Phase 4: remove the hack + repoint everything, then rebuild ---
git apply migration/phase4-cleanup.patch
darwin-rebuild switch --flake .config/nix-darwin-mini
```

### ⚠️ Verification nuance — the hack MASKS native loading
While home is flipped but the hack is still present (i.e. after patch 1, before patch 2),
the retained hack copies the OLD `/Volumes` plists over the fresh native ones and manually
`bootstrap`s them. So a green `launchctl list` at that point does NOT prove native launchd
loading works - it may just be the hack running a **stale** plist. **True native verification
only happens after `phase4-cleanup.patch` removes the hack.** After the second rebuild:
```fish
launchctl list | grep -E 'sketchybar|agent-gossips'
# confirm the loaded plist points at the CURRENT nix-store generation, not a stale copy:
launchctl print "gui/$(id -u)/org.nixos.agent-gossips" | grep -iE 'program|path'
```

> Both patches are reversible at any point via `git checkout -- <file>` + `darwin-rebuild switch`.
> That git-revert path - not the presence of the launchd hack in a running system - is the real safety net.

### Paths covered by `phase4-cleanup.patch` (audited §2, verified-complete 2026-07-11)
`flake.nix` (screencapture, agent-gossips `WorkingDirectory`, `.bun/bin/bun`, daemon script, + hack removal), `.claude/settings.json`, `.config/cursor/settings.json`, `.config/ralph/config.json`, `.config/sketchybar/plugins/agent-gossips.sh` + `claude_sessions.sh`, `.config/fish/config.fish` (dead PATH entries), `.gitconfig` (`safe.directory`), `.config/herdr/plugins.json`, `.config/solana/install/config.yml`.

### Re-point model stores (if using env vars instead of symlinks)
```fish
set -Ux OLLAMA_MODELS /Volumes/HomeX/kento/.ollama/models   # example
```

### Verification checklist
- [ ] `echo $HOME` → `/Users/kento` in a fresh login shell
- [ ] `df -h /System/Volumes/Data` shows ≥20 G free (headroom)
- [ ] fish starts clean, abbreviations/functions load, no missing-path errors
- [ ] `darwin-rebuild switch` completes with no errors
- [ ] sketchybar + agent-gossips launch agents load natively (`launchctl list`)
- [ ] screenshots land in the configured location
- [ ] editors (cursor/nvim/zed) open; obsidian vault path resolves
- [ ] `~/Documents`, `~/.lmstudio`, `~/.ollama` symlinks resolve (`readlink -f`)
- [ ] UTM launches; the 3 VMs (`Kali`, `Linux`, `Metasploitable2`) resolve to `/Volumes/HomeX/kento/VMs/` and boot (re-add via double-click if a bookmark broke across the flip)
- [ ] Claude Code / OMC state under `~/.claude` works; memory dir path resolved
- [ ] eject the external drive briefly: confirm login + base shell still work (only the symlinked bulk should be unavailable, not the session)

---

## 9. Phase 5 — Reclaim the old home (only after a clean week)

> ⚠️ Do NOT delete the old `/Volumes/HomeX/kento` content immediately. Live on the new home for at least a week.

After you're confident:
- Keep the *external bulk* dirs that are symlinked (`Documents`, model stores) where they are — they are still in use.
- Delete only the now-duplicated *internal-bound* copies left behind on the external volume (the ones you rsynced to `/Users`): `dotfiles`, `.config`, `Library`, toolchains, etc.
- ⚠️ Double-check each path is genuinely duplicated on internal before removing the external copy. `diff -rq` a sample first.

---

## 10. Rollback summary (keep handy)

1. Restore the account record:
   `sudo dscl . -create /Users/kento NFSHomeDirectory /Volumes/HomeX/kento`
   (or `git checkout` the flake `home =` line and `darwin-rebuild switch`)
2. Reboot.
3. The original external home is untouched until Phase 5, so rollback is clean any time before then.

---

## Effort estimate (recap — updated 2026-07-11, after session 2 + UTM)
- **✅ Done so far:** Docker (38→2.6 G), Rewind removed (16 G), pnpm (13→5.6 G), Caches (37→9.2 G), Xcode DerivedData (2.6→0), **UTM VMs relocated external** (container 32 G→316 M). `Library` now **69 G** (from 175 G).
- **⛔ DISK GATE STILL NOT MET — the binding constraint.** UTM alone did not close it. Full internal-bound footprint (measured 2026-07-11), NOT just Library:
  | Dir | Size | | Dir | Size |
  |---|---|---|---|---|
  | Library | 69 G | | .cache | 2.9 G |
  | .npm | 15 G | | .paseo | 1.8 G |
  | .local | 14 G | | go | 1.3 G |
  | .bun | 5.8 G | | .cargo+dotfiles+Pics+DL | ~1 G |
  | .claude | 3.6 G | | .codex/.cursor | ~0.3 G |
  | .rustup | 3.2 G | | **TOTAL** | **~118 G** |
  Internal free is **86 G** → **~118 G does not fit** (over by ~32 G, before the 20 G headroom). Must shed ~50 G to reach ≤ ~66 G internal-bound.
- **✅ Round 2 prunes done (2026-07-11, ~40 G reclaimed):** `npm cache clean` (.npm 15→~0 G), `.npm/_npx` (1.9 G), `uv cache clean` (1.7 G), cleared `.cache` (2.9→0 G), `.bun/install/cache` (5.1 G), `go clean -cache -modcache` (1.3→0 G), **Steam game uninstalled** (Neverwinter 9 G), **CoreSimulator all 26 sims deleted** (5.1 G). `Library` now **54 G**.
- **✅ DISK GATE MET (2026-07-11).** Decision: `.local/share` (14 G toolchain data) → **external symlink** (§5); `.local/bin`+`.local/state` stay internal. **Internal-bound = ~65 G** (measured, excluding `.local/share`). Post-flip: 143 G used + 65 G = 208 G → **~21 G free**, clears the ≥20 G headroom. ✅
- ⚠️ **Do NOT delete** `.paseo` (1.8 G, holds `daemon-keypair.json` — real identity) or blindly `.local/share/shuru` (2.6 G microVM rootfs); both ride along external in `.local/share` / stay internal untouched.
- **Switch NOT started:** `$HOME` still `/Volumes/HomeX/kento`, `flake.nix:290` unchanged, `/Users/kento` absent. Patches staged in `migration/`.
- **Recovery gate: met** (second admin account exists). **Backup: skipped by choice** (no external TM device) — mitigated by copy-not-move design + verified-before-delete for irreplaceable data.
- **Next:** (1) close the disk gap (prune caches + relocate Steam + trim `.local`/toolchains); (2) Phase 2 layout; (3) Phase 3 populate `/Users/kento` + `migration/phase3b-flip-home.patch`; (4) `migration/phase4-cleanup.patch`.
