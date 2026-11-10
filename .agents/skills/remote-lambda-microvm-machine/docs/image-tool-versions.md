# Updating tool versions in the mvm image

Every tool the dev image installs is pinned by an `ARG` at the top of `image/Dockerfile` (`NODE_VERSION`, `OMP_VERSION`, `HERDR_VERSION`, `CLAUDE_CODE_VERSION`, ...).
A bump is always deliberate: change the `ARG`, build a new image, commit the Dockerfile.

## Steps

1. Change the version `ARG` in `image/Dockerfile`.
2. Build: `mvm image build` (about 6 to 7 minutes).
   It needs administrator rights: see "Maintaining mvm" in `SKILL.md` for the admin profile.
   It prints `version <N>: SUCCESSFUL` when done.
3. Check it on a fresh machine: `mvm new`, then `ssh <name>.mvm '<tool> --version'`, then `mvm rm <name>`.
4. Commit only the Dockerfile change, with the image version in the message.

- New machines use the latest successful image version; `mvm ls` shows each machine's version in the `IMAGE` column.
- Running machines keep the image they started from until `mvm rm` or their `--ttl`.
- The build fails if a tool's `--version` check in its `RUN` step fails, but it does not check which version that prints.

## Claude Code

`CLAUDE_CODE_VERSION` is passed to Anthropic's installer, `curl -fsSL https://claude.ai/install.sh | bash -s "${CLAUDE_CODE_VERSION}"`, which accepts `X.Y.Z`, `stable` or `latest`.
Always pin an exact `X.Y.Z`: `stable` or `latest` would make the image depend on the build date again.

Find the current release:

```bash
curl -fsSL https://downloads.claude.ai/claude-code-releases/latest   # newest release
curl -fsSL https://downloads.claude.ai/claude-code-releases/stable   # older, more tested release
claude --version                                                     # what the laptop runs
```

Pin the same version the laptop runs, usually `latest`.

Why it is pinned: Claude Code updates itself in the background on a running machine.
With an old version in the image, every new machine downloads the new one (about 340MB) shortly after it starts.
An image built before the pin installed whatever was latest on the build day, so the bump was invisible in the Dockerfile.

Tell the image's version from an auto-update on a machine:

```bash
ssh <name>.mvm 'ls -l --time-style=long-iso ~/.local/share/claude/versions/; readlink -f ~/.local/bin/claude'
```

The file dated at the image build is the baked version; a later file is an auto-update, and `~/.local/bin/claude` points at the one in use.

## History

| Date | Change | Image version |
| --- | --- | --- |
| 2026-11-10 | Claude Code pinned at 2.1.322 (image 25.0 had 2.1.318, unpinned) | 26.0 |
