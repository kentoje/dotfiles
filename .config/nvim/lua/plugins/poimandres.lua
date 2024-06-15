return {
	"olivercederborg/poimandres.nvim",
	enabled = false,
	lazy = false,
	priority = 1000,
	config = function()
		require("poimandres").setup({
			disable_background = true,
			-- leave this setup function empty for default config
			-- or refer to the configuration section
			-- for configuration options
		})
	end,

	-- optionally set the colorscheme within lazy config
	init = function()
		vim.cmd("colorscheme poimandres")
		-- 0x5de4c7

		vim.cmd("hi CursorLineNr guifg=#5de4c7")
		vim.cmd("hi LineNr guifg=#a6accd")
	end,
}
