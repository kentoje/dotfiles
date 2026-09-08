---
name: remove-stale-gitlab-worktrees
description: Audits local GitLab and Maestro worktrees against GitLab open merge requests, then removes only user-confirmed stale worktrees. Use when asked to find, list, prune, clean up, or remove stale Git worktrees, including Maestro worktrees.
---

# Remove stale GitLab worktrees

A stale worktree is a **present, non-primary Git worktree** whose source branch has no open GitLab merge request. Detached worktrees are checked by their `HEAD` commit. GitLab is authoritative; never infer staleness from local branch names, age, or a merged MR alone.

## Script

```sh
python3 "$HOME/dotfiles/.agents/skills/remove-stale-gitlab-worktrees/scripts/remove-stale-gitlab-worktrees.py"
```

The default is read-only. It discovers GitLab repositories under the machine's GitLab roots and `MAESTRO_HOME/worktrees`, deduplicates linked worktrees, verifies GitLab API access, then prints each stale candidate with project, branch or detached commit, path, and dirty state.

## Removal workflow

1. Run the dry run. Treat a failed GitLab API query as a hard stop; do not classify or remove any worktree from partial results.
2. Present the complete candidate list to the user. A worktree with an **open** MR is not stale.
3. If the user approves removal, run:

   ```sh
   python3 "$HOME/dotfiles/.agents/skills/remove-stale-gitlab-worktrees/scripts/remove-stale-gitlab-worktrees.py" --apply
   ```

   To remove a specific candidate after the audit has refreshed, pass its exact path:

   ```sh
   python3 "$HOME/dotfiles/.agents/skills/remove-stale-gitlab-worktrees/scripts/remove-stale-gitlab-worktrees.py" \
     --apply --worktree /absolute/path/to/worktree
   ```

4. The script requires terminal confirmation in the form `remove N`, removes eligible worktrees with `git worktree remove --force`, and runs `git worktree prune` in each affected primary repository. `--worktree` limits the destructive set to exact paths that the current audit still verifies as stale.
5. Dirty and metadata-broken worktrees are protected by default. Review and preserve their changes unless the user explicitly asks to discard them. Only then add `--force-dirty`, `--force-uninspectable`, or both.
6. Report removed, protected-dirty, skipped-broken, and retained-open-MR worktrees separately.

## Scope

- Default roots: `~/Documents/gitlab`, `/Volumes/HomeX/kento/Documents/gitlab`, and `$MAESTRO_HOME/worktrees` (default `/Volumes/HomeX/kento/.maestro/worktrees`).
- Add or restrict roots with repeatable `--root /path/to/repos`.
- Broken metadata is reported and protected because local changes cannot be inspected. Resolve it from the primary repository with `git worktree prune`, or require explicit `--force-uninspectable` consent before discarding its directory. Never delete a worktree directory with `rm -rf`.
- Never remove a primary checkout, a non-GitLab checkout, or a candidate the GitLab API could not verify.
