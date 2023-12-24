return {
	"nvimdev/lspsaga.nvim",
	config = function()
		require("lspsaga").setup({
			symbol_in_winbar = {
				enable = false,
				folder_level = 2,
			},
			lightbulb = {
				virtual_text = false,
			},
			definition = {
				keys = {
					edit = "<C-c>o",
					vsplit = "<C-c>d",
					split = "<C-c>D",
					close = "<C-c>w",
					quit = "<Esc>",
				},
			},
			finder = {
				keys = {
					toggle_or_open = "<CR>",
					shuttle = "s",
					vsplit = "d",
					split = "D",
					close = "x",
					quit = "<Esc>",
				},
			},
			rename = {
				auto_save = true,
				keys = {
					quit = "<C-c>",
				},
			},
		})

		vim.keymap.set(
			"n",
			"<leader>q.",
			":Lspsaga diagnostic_jump_next<CR>",
			{ silent = true, desc = "Jump to next diagnostic" }
		)
		vim.keymap.set(
			"n",
			"<M-.>",
			":Lspsaga diagnostic_jump_next<CR>",
			{ silent = true, desc = "Jump to next diagnostic" }
		)
		vim.keymap.set("n", "<leader>g", ":Lspsaga peek_definition<CR>", { silent = true, desc = "Peek definition" })
		-- vim.keymap.set("n", "<M-g>", ":Lspsaga peek_definition<CR>", { silent = true, desc = "Peek definition" })
		-- mapped by kitty
		vim.keymap.set("n", "<leader>G", ":Lspsaga finder<CR>", { silent = true, desc = "Lookup references" })
		vim.keymap.set("n", "<M-j>", ":Lspsaga hover_doc<CR>", { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>qj", ":Lspsaga hover_doc<CR>", { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader><F2>", ":Lspsaga rename<CR>", { silent = true, desc = "Rename references" })
		vim.keymap.set("n", "<leader>xt", ":Lspsaga term_toggle<CR>", { silent = true, desc = "Floating term" })
	end,
	dependencies = {
		"nvim-treesitter/nvim-treesitter", -- optional
		"nvim-tree/nvim-web-devicons", -- optional
	},
}
