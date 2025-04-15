local dump = require("kentoje.helpers").dump

return {
	"jwbaldwin/oscura.nvim",
	lazy = false,
	enabled = false,
	priority = 1000,
	opts = {
		transparent_background = true,
	},
	-- config = function()
	-- 	require("vscode").setup({
	-- 		transparent = true,
	-- 	})
	-- end,

	-- optionally set the colorscheme within lazy config
	init = function()
		local colors = require("oscura.colors")

		-- Formatted color table for better readability
		-- local formatted_colors = {
		-- 	-- Git colors
		-- 	["git_delete"] = "#D84F68",
		-- 	["git_add"] = "#E6E6E6",
		-- 	["git_change"] = "#E6E7A3",
		--
		-- 	-- Base colors
		-- 	["fg"] = "#E6E6E6",
		-- 	["bg"] = "#0B0B0F",
		-- 	["none"] = "NONE",
		-- 	["black"] = "#000000",
		--
		-- 	-- UI elements
		-- 	["border"] = "#282828",
		-- 	["border_highlight"] = "#E6E7A3",
		-- 	["bg_highlight"] = "#232323",
		-- 	["bg_word_highlight"] = "#333339",
		-- 	["bg_search"] = "#2A2A2E",
		-- 	["bg_visual"] = "#303033",
		-- 	["bg_popup"] = "#2C2C31",
		-- 	["fg_gutter"] = "#32333B",
		-- 	["fg_dark"] = "#C1C1C1",
		--
		-- 	-- Syntax highlighting
		-- 	["function_name"] = "#E6E7A3",
		-- 	["keyword"] = "#9099A1",
		-- 	["string"] = "#E6E6E6",
		-- 	["number"] = "#F9B98C",
		-- 	["type"] = "#E6E7A3",
		-- 	["comment"] = "#46474F",
		-- 	["tag"] = "#E6E7A3",
		-- 	["attribute"] = "#54C0A3",
		-- 	["operator"] = "#9099A1",
		--
		-- 	-- Color groups
		-- 	["teal"] = "#54C0A3",
		-- 	["purple"] = "#9592A4",
		-- 	["yellow"] = "#E6E7A3",
		-- 	["yellow_light"] = "#D6D876",
		-- 	["red"] = "#D84F68",
		-- 	["red_error"] = "#FF5C5C",
		-- 	["blue"] = "#479FFA",
		-- 	["green"] = "#4EBE96",
		-- 	["orange"] = "#F9B98C",
		-- 	["warning"] = "#FFA16C",
		-- 	["hint"] = "#C1C1C1",
		-- 	["info"] = "#E6E7A3",
		--
		-- 	-- Blue variants
		-- 	["blue_01"] = "#1b1f1f",
		-- 	["blue_02"] = "#346969",
		-- 	["blue_03"] = "#479FFA",
		-- 	["blue_04"] = "#799496",
		-- 	["blue_05"] = "#86c1b9",
		--
		-- 	-- Green variants
		-- 	["green_01"] = "#383E2A",
		-- 	["green_02"] = "#4C5B2B",
		-- 	["green_03"] = "#548b40",
		-- 	["green_04"] = "#4EBE96",
		-- 	["green_05"] = "#54C0A3",
		--
		-- 	-- Red variants
		-- 	["red_01"] = "#4C1919",
		-- 	["red_02"] = "#701414",
		-- 	["red_03"] = "#D84F68",
		-- 	["red_04"] = "#FF5C5C",
		-- 	["red_05"] = "#FFCCCC",
		--
		-- 	-- Yellow variants
		-- 	["yellow_01"] = "#7e4e08",
		-- 	["yellow_02"] = "#b08508",
		-- 	["yellow_03"] = "#E6E7A3",
		--
		-- 	-- Orange variants
		-- 	["orange_01"] = "#cc6d00",
		-- 	["orange_02"] = "#F9B98C",
		--
		-- 	-- Purple variants
		-- 	["purple_01"] = "#5E698E",
		-- 	["purple_02"] = "#9592A4",
		-- 	["purple_03"] = "#9592A4",
		--
		-- 	-- Other colors
		-- 	["brown_01"] = "#452b04",
		-- 	["pink_01"] = "#C493B0",
		--
		-- 	-- Light variants
		-- 	["light_01"] = "#E6E6E6",
		-- 	["light_02"] = "#d8d8d8",
		-- 	["light_03"] = "#f9f9f9",
		-- 	["light_04"] = "#fefefe",
		--
		-- 	-- Grey variants
		-- 	["grey_01"] = "#383838",
		-- 	["grey_02"] = "#46474F",
		-- 	["grey_03"] = "#5c5c5c",
		-- 	["grey_04"] = "#787878",
		-- 	["grey_05"] = "#888888",
		-- 	["grey_06"] = "#9c9c9c",
		-- 	["grey_07"] = "#9099A1",
		-- 	["grey_08"] = "#b8b8b8",
		--
		-- 	-- Dark variants
		-- 	["dark_01"] = "#0B0B0F",
		-- 	["dark_02"] = "#111111",
		-- 	["dark_03"] = "#161616",
		-- 	["dark_04"] = "#202020",
		-- 	["dark_05"] = "#212121",
		-- 	["dark_06"] = "#282828",
		--
		-- 	-- Diff colors
		-- 	["diff_add"] = "#2D2D35",
		-- 	["diff_delete"] = "#352A31",
		--
		-- 	-- Brackets
		-- 	["brackets"] = {
		-- 		[1] = "#5C6974",
		-- 		[2] = "#6E678E",
		-- 		[3] = "#6A7782",
		-- 		[4] = "#6A7782",
		-- 		[5] = "#6A7782",
		-- 		[6] = "#6A7782",
		-- 	},
		-- }

		vim.cmd("colorscheme oscura")
		vim.cmd("hi EndOfBuffer guifg=" .. colors.dark_01)

		-- LspSaga
		-- vim.cmd("hi HoverNormal guifg=" .. colors.none .. " guibg=" .. colors.none)
		-- vim.cmd("hi HoverBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)
		-- vim.cmd("hi SagaNormal guifg=" .. "NONE" .. " guibg=" .. "NONE")
		-- vim.cmd("hi SagaBorder guifg=" .. colors.teal2 .. " guibg=" .. "NONE")
		-- WhichKey
		-- vim.cmd("hi WhichKeyBorder guifg=" .. colors.orange .. " guibg=" .. "NONE")
		-- vim.cmd("hi WhichKeyFloat guifg=" .. "NONE" .. " guibg=" .. "NONE")
		-- vim.cmd("hi FloatBorder guifg=" .. colors.orange .. " guibg=" .. "NONE")
		--
		-- vim.cmd("hi MatchParen guifg=" .. colors.orange .. " guibg=" .. "NONE")
		--
		vim.cmd("hi DiffAdd guifg=" .. colors.green_05)
		vim.cmd("hi DiffDelete guifg=" .. colors.red_04)
		vim.cmd("hi DiffChange guifg=" .. colors.yellow_03)
		--
		-- vim.cmd("hi LspSignatureActiveParameter guifg=" .. "NONE" .. " guibg=" .. colors.orange)
		--
		vim.cmd("hi CursorLineNr guifg=" .. colors.green_05)
		-- vim.cmd("hi LineNr guifg=" .. colors.comment)
		--
		-- vim.cmd("hi FzfLuaBorder guifg=" .. colors.orange)
		-- vim.cmd("hi FzfLuaPreviewBorder guifg=" .. colors.orange)
		-- vim.cmd("hi FzfLuaCursor guifg=" .. colors.green)
		-- vim.cmd("hi FzfLuaTitle guifg=" .. colors.green)
		--
		-- vim.cmd("hi RenderMarkdownCodeInline guibg=" .. "NONE")
		-- vim.cmd("hi RenderMarkdownCodeInline guifg=" .. colors.bg)
		-- vim.cmd("hi RenderMarkdownCode guibg=" .. "NONE")
		--
		vim.cmd("hi NormalFloat guifg=" .. colors.none .. " guibg=" .. colors.none)
		vim.cmd("hi FloatBorder guifg=" .. colors.none .. " guibg=" .. colors.none)

		-- Menu when intellisense is triggered
		vim.cmd("hi Pmenu guibg=" .. colors.none)
		vim.cmd("hi FzfLuaNormal guibg=" .. colors.none)
		vim.cmd("hi FzfLuaBorder guifg=" .. colors.none .. " guibg=" .. colors.none)
		vim.cmd("hi Directory guifg=" .. colors.yellow_03)
		vim.cmd("hi Special guifg=" .. colors.yellow_03)

		-- Useful for nvim snack dashboard
		-- vim.cmd("hi Special guifg=" .. colors.vscMediumBlue)
		-- vim.cmd("hi Character guifg=" .. colors.vscBlue)
		-- vim.cmd("hi String guifg=" .. colors.vscBlueGreen)
		--
		-- vim.cmd("hi @character guifg=" .. colors.vscBlue)
		-- vim.cmd("hi @string guifg=" .. colors.vscBlueGreen)

		vim.cmd("hi @type.builtin guifg=" .. colors.green_05)

		-- vim.cmd("hi OilHidden guifg=" .. colors.vscDisabledBlue)
	end,
}
