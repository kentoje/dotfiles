-- Rex italic removal: draws italic highlights upright when Neovim runs inside Rex.
-- Ghostty does this for every app with `font-style-italic = false`; Rex has no
-- such setting, so inside Rex Neovim drops italic from its own highlights instead.
--
-- Covers highlight groups from color schemes (swept on ColorScheme) and groups
-- that plugins define later through nvim_set_hl (stripped as they are set).

local M = {}

local is_inside_rex = require("kentoje.rex-pane-navigation").is_inside_rex

--- Returns a copy of highlight definition `definition` without italic, in both
--- the GUI and the cterm attributes.
local function withoutItalicHighlight(definition)
	local upright = vim.deepcopy(definition)
	upright.italic = nil
	if upright.cterm then
		upright.cterm.italic = nil
	end
	return upright
end

--- Rewrites every italic highlight group already defined as upright.
local function removeItalicHighlights()
	for name, definition in pairs(vim.api.nvim_get_hl(0, {})) do
		if definition.italic or (definition.cterm and definition.cterm.italic) then
			vim.api.nvim_set_hl(0, name, withoutItalicHighlight(definition))
		end
	end
end

--- Turns italic highlights off for this Neovim when inside Rex; a no-op elsewhere.
--- Call after the plugin manager so the active color scheme is swept too.
function M.setup()
	if not is_inside_rex() then
		return
	end

	local set_highlight = vim.api.nvim_set_hl
	vim.api.nvim_set_hl = function(namespace, name, definition)
		return set_highlight(namespace, name, withoutItalicHighlight(definition))
	end

	vim.api.nvim_create_autocmd({ "ColorScheme", "VimEnter" }, {
		group = vim.api.nvim_create_augroup("RexItalicRemoval", { clear = true }),
		callback = removeItalicHighlights,
		desc = "Draw italic highlights upright inside Rex",
	})
	removeItalicHighlights()
end

return M
