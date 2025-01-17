return {
	"olivercederborg/poimandres.nvim",
	lazy = false,
	priority = 1000,
	enabled = false,
	config = function()
		require("poimandres").setup({
			-- leave this setup function empty for default config
			-- or refer to the configuration section
			disable_background = true,
			disable_float_background = true,
		})
	end,

	-- optionally set the colorscheme within lazy config
	init = function()
		local colors = require("poimandres.palette")

		vim.cmd("colorscheme poimandres")
		vim.cmd("hi EndOfBuffer guifg=" .. colors.background2)

		-- LspSaga
		-- vim.cmd("hi HoverNormal guifg=" .. colors.none .. " guibg=" .. colors.none)
		-- vim.cmd("hi HoverBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)
		vim.cmd("hi SagaNormal guifg=" .. colors.none .. " guibg=" .. colors.none)
		vim.cmd("hi SagaBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)
		-- WhichKey
		vim.cmd("hi WhichKeyBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)
		vim.cmd("hi WhichKeyFloat guifg=" .. colors.none .. " guibg=" .. colors.none)
		vim.cmd("hi FloatBorder guifg=" .. colors.teal2 .. " guibg=" .. colors.none)

		vim.cmd("hi MatchParen guifg=" .. colors.teal1 .. " guibg=" .. colors.none)

		vim.cmd("hi LspSignatureActiveParameter guifg=" .. colors.none .. " guibg=" .. colors.teal3)

		vim.cmd("hi CursorLineNr guifg=" .. colors.teal1)

		vim.cmd("hi FzfLuaBorder guifg=" .. colors.teal1)
		vim.cmd("hi FzfLuaPreviewBorder guifg=" .. colors.teal1)
		vim.cmd("hi FzfLuaCursor guifg=" .. colors.pink1)
		vim.cmd("hi FzfLuaTitle guifg=" .. colors.pink1)

		-- vim.cmd("hi RenderMarkdownCodeInline guibg=" .. colors.none)
		-- vim.cmd("hi RenderMarkdownCodeInline guifg=" .. colors.background3)
		-- vim.cmd("hi RenderMarkdownCode guibg=" .. colors.none)

		-- vim.cmd("hi NormalFloat guifg=" .. colors.none .. " guibg=" .. colors.none)
		-- vim.cmd("hi FloatBorder guifg=" .. colors.none .. " guibg=" .. colors.none)
	end,
}
