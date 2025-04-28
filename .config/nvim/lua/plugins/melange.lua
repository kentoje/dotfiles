return {
	"savq/melange-nvim",
	enabled = true,
	lazy = false,
	priority = 1000,
	config = function()
		vim.opt.termguicolors = true
		vim.opt.background = "dark"
	end,
	init = function()
		vim.cmd("colorscheme melange")
		-- vim.cmd("hi CursorLineNr guifg=#625D86")

		vim.cmd("hi NormalFloat guifg=" .. "NONE" .. " guibg=" .. "NONE")
		vim.cmd("hi Normal guifg=" .. "NONE" .. " guibg=" .. "NONE")
		vim.cmd("hi FloatBorder guifg=" .. "NONE" .. " guibg=" .. "NONE")

		vim.api.nvim_set_hl(0, "Visual", { bg = "#403A36", fg = "#EAC16C" })
	end,
}
