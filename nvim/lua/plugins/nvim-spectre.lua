return {
	"nvim-pack/nvim-spectre",
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
	config = function()
		require("spectre").setup()

		vim.keymap.set("n", "<leader>fg", '<cmd>lua require("spectre").toggle()<CR>', {
			desc = "Toggle Spectre buffer",
		})
		vim.keymap.set("n", "<leader>fc", '<cmd>lua require("spectre").open_visual({select_word=true})<CR>', {
			desc = "Search on current word",
		})
	end,
}
