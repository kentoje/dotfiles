return {
	"Mofiqul/vscode.nvim",
	lazy = false,
	priority = 1000,
	enabled = false,
	config = function()
		require("vscode").setup({
			transparent = true,
		})
	end,

	-- optionally set the colorscheme within lazy config
	init = function()
		-- {
		--     ["vscGitRenamed"] = "#73c991",
		--     ["vscContextCurrent"] = "#707070",
		--     ["vscGreen"] = "#6A9955",
		--     ["vscUiOrange"] = "#f28b25",
		--     ["vscDarkBlue"] = "#223E55",
		--     ["vscSelection"] = "#264F78",
		--     ["vscLeftLight"] = "#636369",
		--     ["vscTabCurrent"] = "#1F1F1F",
		--     ["vscSplitThumb"] = "#424242",
		--     ["vscTabOutside"] = "#252526",
		--     ["vscTabOther"] = "#2D2D2D",
		--     ["vscLeftDark"] = "#252526",
		--     ["vscContext"] = "#404040",
		--     ["vscLeftMid"] = "#373737",
		--     ["vscAccentBlue"] = "#4FC1FF",
		--     ["vscPopupFront"] = "#BBBBBB",
		--     ["vscSearch"] = "#613315",
		--     ["vscGitStageModified"] = "#e2c08d",
		--     ["vscSearchCurrent"] = "#515c6a",
		--     ["vscNone"] = "NONE",
		--     ["vscLightGreen"] = "#B5CEA8",
		--     ["vscGitAdded"] = "#81b88b",
		--     ["vscLineNumber"] = "#5A5A5A",
		--     ["vscGitUntracked"] = "#73c991",
		--     ["vscFoldBackground"] = "#202d39",
		--     ["vscGitSubmodule"] = "#8db9e2",
		--     ["vscPopupHighlightGray"] = "#343B41",
		--     ["vscSplitDark"] = "#444444",
		--     ["vscGitConflicting"] = "#e4676b",
		--     ["vscViolet"] = "#646695",
		--     ["vscGitStageDeleted"] = "#c74e39",
		--     ["vscPopupHighlightBlue"] = "#004b72",
		--     ["vscDiffRedLight"] = "#6F1313",
		--     ["vscDiffRedDark"] = "#4B1818",
		--     ["vscDiffGreenLight"] = "#4B5632",
		--     ["vscBlue"] = "#569CD6",
		--     ["vscUiBlue"] = "#084671",
		--     ["vscDisabledBlue"] = "#729DB3",
		--     ["vscCursorLight"] = "#AEAFAD",
		--     ["vscCursorDark"] = "#51504F",
		--     ["vscPopupBack"] = "#272727",
		--     ["vscCursorDarkDark"] = "#222222",
		--     ["vscGray"] = "#808080",
		--     ["vscFront"] = "#D4D4D4",
		--     ["vscBlueGreen"] = "#4EC9B0",
		--     ["vscRed"] = "#F44747",
		--     ["vscDarkYellow"] = "#FFD602",
		--     ["vscDiffRedLightLight"] = "#FB0101",
		--     ["vscSplitLight"] = "#898989",
		--     ["vscLightRed"] = "#D16969",
		--     ["vscYellowOrange"] = "#D7BA7D",
		--     ["vscMediumBlue"] = "#18a2fe",
		--     ["vscDiffGreenDark"] = "#373D29",
		--     ["vscOrange"] = "#CE9178",
		--     ["vscPopupHighlightLightBlue"] = "#d7eafe",
		--     ["vscDimHighlight"] = "#51504F",
		--     ["vscPink"] = "#C586C0",
		--     ["vscGitModified"] = "#e2c08d",
		--     ["vscYellow"] = "#DCDCAA",
		--     ["vscLightBlue"] = "#9CDCFE",
		--     ["vscGitDeleted"] = "#c74e39",
		--     ["vscBack"] = "NONE",
		--     ["vscGitIgnored"] = "#8c8c8c"
		-- }

		local colors = require("vscode.colors").get_colors()

		vim.cmd("colorscheme vscode")
		vim.cmd("hi EndOfBuffer guifg=" .. colors.vscTabCurrent)

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
		vim.cmd("hi DiffAdd guifg=" .. colors.vscBlueGreen)
		vim.cmd("hi DiffDelete guifg=" .. colors.vscLightRed)
		vim.cmd("hi DiffChange guifg=" .. colors.vscMediumBlue)
		--
		-- vim.cmd("hi LspSignatureActiveParameter guifg=" .. "NONE" .. " guibg=" .. colors.orange)
		--
		vim.cmd("hi CursorLineNr guifg=" .. colors.vscPink)
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
		vim.cmd("hi NormalFloat guifg=" .. "NONE" .. " guibg=" .. "NONE")
		vim.cmd("hi FloatBorder guifg=" .. "NONE" .. " guibg=" .. "NONE")

		-- Menu when intellisense is triggered
		vim.cmd("hi Pmenu guibg=NONE")

		-- Useful for nvim snack dashboard
		vim.cmd("hi Special guifg=" .. colors.vscMediumBlue)
		vim.cmd("hi Character guifg=" .. colors.vscBlue)
		vim.cmd("hi String guifg=" .. colors.vscBlueGreen)

		vim.cmd("hi @character guifg=" .. colors.vscBlue)
		vim.cmd("hi @string guifg=" .. colors.vscBlueGreen)

		vim.cmd("hi OilHidden guifg=" .. colors.vscDisabledBlue)
	end,
}
