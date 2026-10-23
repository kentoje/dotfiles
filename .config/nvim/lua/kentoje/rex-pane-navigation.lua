-- Rex pane navigation: <C-h/j/k/l> moves between Neovim splits, and at a split
-- edge hands focus to the neighbouring Rex pane via `rex focus <direction>`.
-- Rex side: ~/.config/rex/vim-aware-pane-navigation.lua forwards these keys to
-- Neovim when it runs in the focused pane, so the two halves meet here.
--
-- Only active inside Rex (REX_BLOCK is set in every Rex terminal); elsewhere
-- the herdr/tmux maps from vim-herdr-navigation stay in charge.
-- :RexNavigationToggle switches the edge handoff off/on for this session.

local M = {}

local WINCMD_BY_DIRECTION = { left = "h", down = "j", up = "k", right = "l" }

local edge_handoff_enabled = true

--- True when this Neovim runs inside a Rex terminal pane.
function M.is_inside_rex()
	return vim.env.REX_BLOCK ~= nil and vim.env.REX_BLOCK ~= ""
end

--- Moves to the Neovim split in `direction`; at the edge, focuses the Rex pane
--- that way instead (fire-and-forget, so Neovim never waits on the CLI).
function M.navigate_rex_pane(direction)
	local previous_window = vim.api.nvim_get_current_win()
	vim.cmd("wincmd " .. WINCMD_BY_DIRECTION[direction])
	if vim.api.nvim_get_current_win() ~= previous_window or not edge_handoff_enabled then
		return
	end
	vim.system({ "rex", "focus", direction }, { text = true }, function(result)
		if result.code ~= 0 then
			vim.schedule(function()
				vim.notify("Rex pane focus failed: " .. (result.stderr or ""), vim.log.levels.WARN)
			end)
		end
	end)
end

--- Installs the <C-h/j/k/l> maps and :RexNavigationToggle when inside Rex.
--- Call after other navigation plugins so these maps win.
function M.setup()
	if not M.is_inside_rex() then
		return
	end

	for lhs, direction in pairs({ ["<C-h>"] = "left", ["<C-j>"] = "down", ["<C-k>"] = "up", ["<C-l>"] = "right" }) do
		vim.keymap.set("n", lhs, function()
			M.navigate_rex_pane(direction)
		end, { silent = true, noremap = true, desc = "Navigate " .. direction .. " (vim/rex)" })
	end

	vim.api.nvim_create_user_command("RexNavigationToggle", function()
		edge_handoff_enabled = not edge_handoff_enabled
		vim.notify("Rex pane navigation " .. (edge_handoff_enabled and "enabled" or "disabled"))
	end, { desc = "Toggle handing <C-h/j/k/l> off to Rex panes at split edges" })
end

return M
