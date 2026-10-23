-- Prefix+shift+g: create a git worktree for a new or existing branch and open
-- it as its own Rex session, like herdr's new_worktree.

local TERMINAL = "com.superlogical.terminal"

rex.action{
  name = "new_git_worktree_session",
  title = "New Git Worktree Session…",
  keywords = "git worktree branch session workspace new",
  run = function(ctx)
    local proc = rex.block.call(TERMINAL, "process", { block_id = ctx.block_id })
    local cwd = proc and proc.foreground and proc.foreground.cwd
    -- The client ID lets the script switch this app to the new session even
    -- when stale clients from earlier app launches are still listed.
    local argv = { "fish", "--no-config", "scripts/rex-git-worktree-session.fish", ctx.client_id or "" }
    openZoomedCommandPane(ctx, argv, { cwd = cwd })
  end,
}
