-- tuios pane navigation: <C-h/j/k/l> moves between Neovim splits, and at a split
-- edge hands focus to the neighbouring tuios pane.
-- tuios side: ~/.config/tuios/config.toml binds the same keys to terminal_focus_*
-- with appearance.nvim_navigation = true. While this Neovim announces itself
-- active over OSC 7777, tuios forwards the keys here instead of moving focus,
-- and moves focus when we report a split edge. Same protocol as
-- Tim4c/tuios-nvim-navigator.
--
-- Only active inside tuios (TUIOS_ENV is set in every tuios pane); elsewhere
-- the herdr/tmux maps from vim-herdr-navigation stay in charge. tuios also sets
-- HERDR_PANE_ID, so these maps must win over the herdr ones.

local M = {}

local WINCMD_BY_DIRECTION = { left = "h", down = "j", up = "k", right = "l" }

--- True when this Neovim runs inside a tuios pane.
function M.is_inside_tuios()
	return vim.env.TUIOS_ENV ~= nil and vim.env.TUIOS_ENV ~= ""
end

--- Writes one tuios-nvim-navigator OSC 7777 message (`state` or `focus`) to tuios.
local function send_tuios_navigator_message(command, value)
	io.stdout:write("\27]7777;tuios-nvim-navigator;" .. command .. ";" .. value .. "\7")
	io.stdout:flush()
end

--- Moves to the Neovim split in `direction`; at the edge, asks tuios to focus
--- the pane that way instead.
function M.navigate_tuios_pane(direction)
	local previous_window = vim.api.nvim_get_current_win()
	vim.cmd("wincmd " .. WINCMD_BY_DIRECTION[direction])
	if vim.api.nvim_get_current_win() == previous_window then
		send_tuios_navigator_message("focus", direction)
	end
end

--- Installs the <C-h/j/k/l> maps and the active/inactive announcements when
--- inside tuios. Call after other navigation plugins so these maps win.
function M.setup()
	if not M.is_inside_tuios() then
		return
	end

	for lhs, direction in pairs({ ["<C-h>"] = "left", ["<C-j>"] = "down", ["<C-k>"] = "up", ["<C-l>"] = "right" }) do
		vim.keymap.set("n", lhs, function()
			M.navigate_tuios_pane(direction)
		end, { silent = true, noremap = true, desc = "Navigate " .. direction .. " (vim/tuios)" })
	end

	local function announce_active()
		send_tuios_navigator_message("state", "active")
	end
	local function announce_inactive()
		send_tuios_navigator_message("state", "inactive")
	end

	announce_active()
	local group = vim.api.nvim_create_augroup("TuiosPaneNavigation", { clear = true })
	vim.api.nvim_create_autocmd({ "VimResume", "FocusGained" }, { group = group, callback = announce_active })
	-- Suspended (ctrl+z) or gone: the shell underneath needs ctrl+h/j/k/l to move panes again.
	vim.api.nvim_create_autocmd({ "VimSuspend", "VimLeavePre" }, { group = group, callback = announce_inactive })
end

return M
