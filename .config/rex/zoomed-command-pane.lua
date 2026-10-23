-- Opens a command in a temporary pane that fills the window, for the pickers
-- and the scrollback view. A split zoomed over the window hides the panes
-- under it; a floating layer would not, because Rex's glass style lets them
-- show through. The pane closes when the command exits, which ends the zoom
-- and returns focus to the pane it was opened from.

local REX_CONFIG_DIR = os.getenv("HOME") .. "/.config/rex"

--- Opens argv in a new split beside ctx.block_id, zoomed to fill the window,
--- and focuses it. Paths in argv starting with "scripts/" resolve against
--- ~/.config/rex. opts.cwd sets the working directory.
function openZoomedCommandPane(ctx, argv, opts)
  opts = opts or {}
  local command = {}
  for i, arg in ipairs(argv) do
    if arg:sub(1, 8) == "scripts/" then
      command[i] = REX_CONFIG_DIR .. "/" .. arg
    else
      command[i] = arg
    end
  end

  local split, err = rex.session.new_split{
    anchor_id = ctx.block_id,
    direction = "horizontal",
    side = "after",
    focus = true,
    layout = rex.layout.block{
      flavor = "com.superlogical.terminal.shell",
      options = { command = command, cwd = opts.cwd },
    },
  }
  if split == nil then error("zoomed command pane: " .. tostring(err), 0) end

  local _, zoomErr = rex.session.zoom_block{ block_id = split.block_ids[1], zoom = true }
  if zoomErr ~= nil then error("zoomed command pane zoom: " .. tostring(zoomErr), 0) end
end
