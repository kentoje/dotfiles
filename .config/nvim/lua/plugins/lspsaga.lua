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
					edit = "<leader>e",
					vsplit = "<leader>d",
					split = "<leader>D",
					close = "<leader>w",
					quit = "<Esc><Esc>",
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
					quit = "<Esc><Esc>",
				},
			},
		})

		-- vim.keymap.set(
		-- 	{ "n", "v" },
		-- 	"<leader>q.",
		-- 	":Lspsaga diagnostic_jump_next<CR>",
		-- 	{ silent = true, desc = "Jump to next diagnostic" }
		-- )
		vim.keymap.set(
			{ "n", "v" },
			"g.",
			":Lspsaga diagnostic_jump_next<CR>",
			{ silent = true, desc = "Jump to next diagnostic" }
		)
		-- vim.keymap.set({ "n", "v" }, "<leader>q.", vim.lsp.buf.code_action, { silent = true, desc = "Code action" })
		vim.keymap.set("n", "<leader>g", ":Lspsaga peek_definition<CR>", { silent = true, desc = "Peek definition" })
		-- vim.keymap.set(
		-- 	"n",
		-- 	"<leader>j",
		-- 	":Lspsaga peek_type_definition<CR>",
		-- 	{ silent = true, desc = "Peek type definition" }
		-- )
		-- vim.keymap.set("n", "<leader>G", ":Lspsaga finder<CR>", { silent = true, desc = "Lookup references" })
		vim.keymap.set("n", "gF", ":Lspsaga finder<CR>", { silent = true, desc = "Lookup references" })
		-- vim.keymap.set("n", "<leader>qj", ":Lspsaga hover_doc<CR>", { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "gd", ":Lspsaga hover_doc<CR>", { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>cr", ":Lspsaga rename<CR>", { silent = true, desc = "Rename references" })
	end,
}
