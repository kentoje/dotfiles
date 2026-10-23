-- Key bindings mirroring the Ghostty + herdr workflow.
-- Herdr "workspace" = Rex session, herdr "tab" = Rex tab (window), pane = pane.
-- Two layers, like today:
--   Cmd layer    - what Ghostty forwarded to herdr, plus herdr's direct cmd keys.
--   ctrl+b layer - herdr's prefix keys on a tmux-style ctrl+b prefix (ctrl+b>x).

---------------------------------------------------------------------------
-- Cmd layer
---------------------------------------------------------------------------

-- Panes
rex.bind("cmd+d", "pane.split", { direction = "right" })
rex.bind("cmd+shift+d", "pane.split", { direction = "down" })
rex.bind("cmd+f", "pane.zoom")
rex.bind("cmd+p", "pane.insert_path")
rex.bind("cmd+o", "open_screen_url")
-- Keyboard scrolling: scrollback in Neovim (was herdr copy mode on cmd+s).
rex.bind("cmd+s", "open_scrollback_in_editor")

-- Tabs
rex.bind("cmd+t", "client.tab.new")
rex.bind("cmd+h", "client.tab.previous")
rex.bind("cmd+l", "client.tab.next")
rex.bind("cmd+r", "client.tab.rename")
rex.bind("cmd+1", "client.tab.goto", { index = 1 })
rex.bind("cmd+2", "client.tab.goto", { index = 2 })
rex.bind("cmd+3", "client.tab.goto", { index = 3 })
rex.bind("cmd+4", "client.tab.goto", { index = 4 })
rex.bind("cmd+5", "client.tab.goto", { index = 5 })
rex.bind("cmd+6", "client.tab.goto", { index = 6 })
rex.bind("cmd+7", "client.tab.goto", { index = 7 })
rex.bind("cmd+8", "client.tab.goto", { index = 8 })
rex.bind("cmd+9", "client.tab.goto", { index = 9 })

-- Sessions (herdr workspaces)
rex.bind("cmd+k", "session.previous")
rex.bind("cmd+j", "session.next")
rex.bind("cmd+n", "session.new")
rex.bind("cmd+shift+r", "session.rename")
rex.bind("cmd+g", "session.switch")

-- Agents
rex.bind("cmd+e", "focus_next_agent_pane")
rex.bind("cmd+shift+e", "focus_previous_agent_pane")

-- Chrome
rex.bind("cmd+shift+b", "client.sidebar.toggle")

-- Ghostty wrote a raw "\n" on shift+enter (multi-line input in agents). Write
-- the byte itself: a key event would be re-encoded under the Kitty protocol.
rex.bind("shift+enter", function(ctx, ev)
  local blockId = findFocusedBlockId(ctx)
  if not blockId then return false end
  rex.block.call("com.superlogical.terminal", "write", { block_id = blockId, data = "\n" })
  return true
end)

-- Vim-aware pane focus (vim-herdr-navigation).
rex.bind("ctrl+h", vimAwarePaneFocusHandler("left"))
rex.bind("ctrl+j", vimAwarePaneFocusHandler("down"))
rex.bind("ctrl+k", vimAwarePaneFocusHandler("up"))
rex.bind("ctrl+l", vimAwarePaneFocusHandler("right"))

---------------------------------------------------------------------------
-- ctrl+b prefix layer (tmux-style; herdr itself still uses ctrl+a)
---------------------------------------------------------------------------

-- Press the prefix twice to send one ctrl+b (cursor back) to the shell.
rex.bind("ctrl+b>ctrl+b", "pane.send_key", { key = "ctrl+b" })

-- Panes. % and " on a US layout.
rex.bind("ctrl+b>shift+5", "pane.split", { direction = "right" })
rex.bind("ctrl+b>shift+'", "pane.split", { direction = "down" })
rex.bind("ctrl+b>x", "pane.close")
rex.bind("ctrl+b>z", "pane.zoom")
rex.bind("ctrl+b>h", "pane.focus.left")
rex.bind("ctrl+b>l", "pane.focus.right")
rex.bind("ctrl+b>tab", "pane.focus_next")
rex.bind("ctrl+b>shift+tab", "pane.focus_previous")
rex.bind("ctrl+b>p", "pane.insert_path")
rex.bind("ctrl+b>o", "open_screen_url")
rex.bind("ctrl+b>[", "open_scrollback_in_editor")
rex.bind("ctrl+b>r", "client.mode.enter", { name = "resize" })

-- Tabs
rex.bind("ctrl+b>c", "client.tab.new")
rex.bind("ctrl+b>shift+x", "client.tab.close")
rex.bind("ctrl+b>1", "client.tab.goto", { index = 1 })
rex.bind("ctrl+b>2", "client.tab.goto", { index = 2 })
rex.bind("ctrl+b>3", "client.tab.goto", { index = 3 })
rex.bind("ctrl+b>4", "client.tab.goto", { index = 4 })
rex.bind("ctrl+b>5", "client.tab.goto", { index = 5 })
rex.bind("ctrl+b>6", "client.tab.goto", { index = 6 })
rex.bind("ctrl+b>7", "client.tab.goto", { index = 7 })
rex.bind("ctrl+b>8", "client.tab.goto", { index = 8 })
rex.bind("ctrl+b>9", "client.tab.goto", { index = 9 })

-- Sessions (herdr workspaces)
rex.bind("ctrl+b>j", "session.switch")
rex.bind("ctrl+b>shift+n", "session.new")
rex.bind("ctrl+b>shift+g", "new_git_worktree_session")
rex.bind("ctrl+b>d", "session.close")

-- App
rex.bind("ctrl+b>shift+b", "client.sidebar.toggle")
rex.bind("ctrl+b>s", "client.settings")
rex.bind("ctrl+b>shift+/", "client.palette.toggle")
rex.bind("ctrl+b>shift+r", "client.config.reload")
rex.bind("ctrl+b>q", "client.window.close")

---------------------------------------------------------------------------
-- Resize mode (herdr resize_mode): h/j/k/l or arrows, shift for big steps.
---------------------------------------------------------------------------

rex.mode("resize", { exclusive = true })
rex.bind("resize/h", "pane.resize", { direction = "left" })
rex.bind("resize/j", "pane.resize", { direction = "down" })
rex.bind("resize/k", "pane.resize", { direction = "up" })
rex.bind("resize/l", "pane.resize", { direction = "right" })
rex.bind("resize/left", "pane.resize", { direction = "left" })
rex.bind("resize/down", "pane.resize", { direction = "down" })
rex.bind("resize/up", "pane.resize", { direction = "up" })
rex.bind("resize/right", "pane.resize", { direction = "right" })
rex.bind("resize/shift+h", "pane.resize", { direction = "left", amount = 15 })
rex.bind("resize/shift+j", "pane.resize", { direction = "down", amount = 15 })
rex.bind("resize/shift+k", "pane.resize", { direction = "up", amount = 15 })
rex.bind("resize/shift+l", "pane.resize", { direction = "right", amount = 15 })
rex.bind("resize/=", "pane.balance")
rex.bind("resize/enter", "client.mode.exit")
rex.bind("resize/q", "client.mode.exit")
