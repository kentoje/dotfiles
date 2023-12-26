return {
	"nvim-pack/nvim-spectre",
	event = { "VeryLazy" },
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
	config = function()
		require("spectre").setup({
			find_engine = {
				["rg"] = {
					cmd = "rg",
					args = {
						"--color=never",
						"--no-heading",
						"--with-filename",
						"--line-number",
						"--column",
						"--no-ignore",
						"--hidden",
						"-g",
						"!node_modules/*",
						"-g",
						"!.yarn",
						"-g",
						"!.git/logs",
						"-g",
						"!type-docs",
						"-g",
						"!build",
						"-g",
						"!local-build",
						"-g",
						"!storybook-static",
					},
				},
			},
		})

		vim.keymap.set("n", "<leader>fG", '<cmd>lua require("spectre").toggle()<CR>', {
			desc = "Toggle Spectre buffer",
		})
		vim.keymap.set("n", "<leader>fC", '<cmd>lua require("spectre").open_visual({select_word=true})<CR>', {
			desc = "Search on current word",
		})
	end,
}
