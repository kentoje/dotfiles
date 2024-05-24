return {
	"nvimdev/lspsaga.nvim",
	dependencies = {
		"nvim-treesitter/nvim-treesitter", -- optional
		"nvim-tree/nvim-web-devicons", -- optional
	},
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
				width = 0.8,
				height = 0.8,
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
				in_select = false,
				auto_save = true,
				keys = {
					quit = "<C-c>",
				},
			},
		})

		vim.keymap.set(
			{ "n", "v" },
			"<leader>q.",
			":Lspsaga diagnostic_jump_next<CR>",
			{ silent = true, desc = "Jump to next diagnostic" }
		)
		-- vim.keymap.set({ "n", "v" }, "<leader>q.", vim.lsp.buf.code_action, { silent = true, desc = "Code action" })
		vim.keymap.set("n", "<leader>g", ":Lspsaga peek_definition<CR>", { silent = true, desc = "Peek definition" })
		vim.keymap.set(
			"n",
			"<leader>j",
			":Lspsaga peek_type_definition<CR>",
			{ silent = true, desc = "Peek type definition" }
		)
		vim.keymap.set("n", "<leader>G", ":Lspsaga finder<CR>", { silent = true, desc = "Lookup references" })
		vim.keymap.set("n", "<leader>qj", ":Lspsaga hover_doc<CR>", { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>cr", ":Lspsaga rename<CR>", { silent = true, desc = "Rename references" })
	end,
}
