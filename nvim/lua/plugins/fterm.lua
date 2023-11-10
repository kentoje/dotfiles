return {
	"numToStr/FTerm.nvim",
	config = function()
		require("FTerm").setup({
			border = "double",
			dimensions = {
				height = 0.9,
				width = 0.9,
			},
		})

		-- Example keybindings
		vim.keymap.set("n", "<C-b>", '<CMD>lua require("FTerm").toggle()<CR>')
		vim.keymap.set("t", "<C-b>", '<C-\\><C-n><CMD>lua require("FTerm").toggle()<CR>')
	end,
}
