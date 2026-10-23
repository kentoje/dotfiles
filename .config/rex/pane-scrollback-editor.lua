-- Cmd+s: open the focused pane's whole scrollback in Neovim, in a temporary
-- pane zoomed over the window.
--
-- WORKAROUND: keyboard scrolling belongs inside Rex itself (scroll page
-- up/down, top/bottom actions to bind). Rex has none yet, so this stands in
-- for it. Replace it with plain bindings once Rex ships those actions.
--
-- Until then this is the keyboard way to scroll, search and yank, like tmux
-- copy mode or herdr's edit_scrollback. It is a snapshot: plain text, taken
-- when the key is pressed.

local TERMINAL = "com.superlogical.terminal"

local function withoutTrailingBlankLines(text)
  return (text:gsub("[%s\n]+$", "")) .. "\n"
end

rex.action{
  name = "open_scrollback_in_editor",
  title = "Open Scrollback in Neovim",
  keywords = "scroll scrollback history copy mode vim neovim keyboard",
  run = function(ctx)
    local screen, err = rex.block.call(TERMINAL, "format", { block_id = ctx.block_id, unwrap = true, trim = true })
    if screen == nil then error("pane scrollback editor: " .. tostring(err), 0) end

    local snapshotPath = os.tmpname()
    local file = assert(io.open(snapshotPath, "w"))
    file:write(withoutTrailingBlankLines(screen.content))
    file:close()

    openZoomedCommandPane(ctx, { "fish", "--no-config", "scripts/rex-scrollback-editor.fish", snapshotPath })
  end,
}
