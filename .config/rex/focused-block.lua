-- Finds the focused block for key handlers, whose ctx may lack block_id.

--- Returns the focused block's ID: ctx.block_id when Rex provides it, else the
--- focused block of the session's active window. Nil when there is none.
function findFocusedBlockId(ctx)
  if ctx.block_id then return ctx.block_id end
  local view = rex.session.view{}
  if not view or not view.windows then return nil end
  for _, window in ipairs(view.windows) do
    if window.window_id == view.active_window_id then return window.focused_block_id end
  end
end
