return {
	"datsfilipe/vesper.nvim",
	enabled = false,
	lazy = false,
	priority = 1000,
	config = function()
		require("vesper").setup({
			transparent = true, -- Boolean: Sets the background to transparent
			italics = {
				comments = true, -- Boolean: Italicizes comments
				keywords = true, -- Boolean: Italicizes keywords
				functions = true, -- Boolean: Italicizes functions
				strings = true, -- Boolean: Italicizes strings
				variables = true, -- Boolean: Italicizes variables
			},
			overrides = {}, -- A dictionary of group names, can be a function returning a dictionary or a table.
			palette_overrides = {},
		})
	end,

	-- optionally set the colorscheme within lazy config
	init = function()
		-- {
		--   ["bg"] = #101010,
		--   ["bgDark"] = #161616,
		--   ["bgDarker"] = #232323,
		--   ["bgFloat"] = #282828,
		--   ["bgOption"] = #343434,
		--   ["black"] = #343434,
		--   ["border"] = #505050,
		--   ["borderDarker"] = #A0A0A0,
		--   ["borderFocus"] = #65737E,
		--   ["comment"] = #7D7D7D,
		--   ["error"] = #FF8080,
		--   ["fg"] = #CCCCCC,
		--   ["fgAlt"] = #FEFEFE,
		--   ["fgCommand"] = #FEFEFE,
		--   ["fgDisabled"] = #505050,
		--   ["fgInactive"] = #65737E,
		--   ["fgLineNr"] = #505050,
		--   ["fgSelection"] = #343434,
		--   ["fgSelectionInactive"] = #505050,
		--   ["green"] = #82D9C2,
		--   ["greenLight"] = #82D9C2,
		--   ["hint"] = #65737E,
		--   ["info"] = #99FFE4,
		--   ["orange"] = #FFCFA8,
		--   ["orangeLight"] = #FFCFA8,
		--   ["primary"] = #A0A0A0,
		--   ["purple"] = #FFCFA8,
		--   ["purpleDark"] = #515C65,
		--   ["red"] = #FF8080,
		--   ["redDark"] = #FF8080,
		--   ["secondary"] = #FFFFFF,
		--   ["symbol"] = #65737E,
		--   ["terminalbrightblack"] = #343434,
		--   ["warn"] = #FFC799,
		--   ["white"] = #FFFFFF,
		--   ["yellowDark"] = #FFC799
		-- }

		local colors = require("vesper.colors")

		vim.cmd("colorscheme vesper")
		vim.cmd("hi EndOfBuffer guifg=" .. colors.bg)

		-- LspSaga
		-- vim.cmd("hi HoverNormal guifg=" .. colors.none .. " guibg=" .. colors.none)
		-- vim.cmd("hi HoverBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)
		-- vim.cmd("hi SagaNormal guifg=" .. "NONE" .. " guibg=" .. "NONE")
		-- vim.cmd("hi SagaBorder guifg=" .. colors.teal2 .. " guibg=" .. "NONE")
		-- WhichKey
		vim.cmd("hi WhichKeyBorder guifg=" .. colors.orange .. " guibg=" .. "NONE")
		vim.cmd("hi WhichKeyFloat guifg=" .. "NONE" .. " guibg=" .. "NONE")
		vim.cmd("hi FloatBorder guifg=" .. colors.orange .. " guibg=" .. "NONE")

		vim.cmd("hi MatchParen guifg=" .. colors.orange .. " guibg=" .. "NONE")

		vim.cmd("hi DiffAdd guifg=" .. colors.green)
		vim.cmd("hi DiffDelete guifg=" .. colors.red)
		vim.cmd("hi DiffChange guifg=" .. colors.orange)

		vim.cmd("hi LspSignatureActiveParameter guifg=" .. "NONE" .. " guibg=" .. colors.orange)

		vim.cmd("hi CursorLineNr guifg=" .. colors.green)
		vim.cmd("hi LineNr guifg=" .. colors.comment)

		vim.cmd("hi FzfLuaBorder guifg=" .. colors.orange)
		vim.cmd("hi FzfLuaPreviewBorder guifg=" .. colors.orange)
		vim.cmd("hi FzfLuaCursor guifg=" .. colors.green)
		vim.cmd("hi FzfLuaTitle guifg=" .. colors.green)

		vim.cmd("hi RenderMarkdownCodeInline guibg=" .. "NONE")
		vim.cmd("hi RenderMarkdownCodeInline guifg=" .. colors.bg)
		vim.cmd("hi RenderMarkdownCode guibg=" .. "NONE")

		vim.cmd("hi NormalFloat guifg=" .. "NONE" .. " guibg=" .. "NONE")
		vim.cmd("hi FloatBorder guifg=" .. "NONE" .. " guibg=" .. "NONE")
	end,
}
