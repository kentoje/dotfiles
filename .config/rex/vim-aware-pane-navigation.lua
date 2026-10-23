-- Ctrl+h/j/k/l moves between Rex panes, but passes the key through when the
-- focused pane runs Vim/Neovim, so the editor moves between its own splits.
-- Port of the herdr vim-herdr-navigation plugin (vim-tmux-navigator style).

local TERMINAL = "com.superlogical.terminal"
local VIM_PROCESS_NAMES = { vim = true, nvim = true, vimdiff = true, view = true }

local function isVimRunningInBlock(blockId)
  if not blockId then return false end
  local proc = rex.block.call(TERMINAL, "process", { block_id = blockId })
  local fg = proc and proc.foreground
  return fg ~= nil and VIM_PROCESS_NAMES[fg.name] == true
end

--- Returns a key handler that focuses the pane in `direction`, unless Vim is
--- in the focused pane, in which case the key goes to Vim.
function vimAwarePaneFocusHandler(direction)
  return function(ctx, ev)
    if isVimRunningInBlock(findFocusedBlockId(ctx)) then return false end
    rex.session.focus_direction{ direction = direction, wrap = false }
    return true
  end
end
