return {
	"nvim-pack/nvim-spectre",
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
	config = function()
		require("spectre").setup()

		vim.keymap.set("n", "<leader>xs", '<cmd>lua require("spectre").toggle()<CR>', {
			desc = "Toggle Spectre buffer",
		})
	end,
}
