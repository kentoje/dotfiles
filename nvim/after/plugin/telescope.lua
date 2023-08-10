if not vim.g.vscode then
	local telescope = require("telescope")

	telescope.load_extension("harpoon")
	telescope.load_extension("neoclip")

	telescope.setup({
		defaults = {
			file_ignore_patterns = {
				"node_modules",
				"yarn.lock",
				".yarn",
				".git/",
			},
			path_display = { "smart" },
			prompt_prefix = " ",
			selection_caret = " ",
			sorting_strategy = "ascending",
			pickers = {
				buffers = {
					prompt_prefix = "﬘ ",
				},
				commands = {
					prompt_prefix = " ",
				},
				git_files = {
					prompt_prefix = " ",
					show_untracked = true,
				},
			},
		},
	})

	local builtin = require("telescope.builtin")

	vim.keymap.set("n", "<leader>p", function()
		builtin.git_files({ hidden = true })
	end, {})
	vim.keymap.set("n", "<leader>ff", function()
		builtin.find_files({ hidden = true })
	end, {})
	vim.keymap.set("n", "<leader>fb", builtin.buffers, {})
	vim.keymap.set("n", "<leader>fc", builtin.grep_string, {})
	vim.keymap.set("n", "<leader>fg", function()
		builtin.live_grep({ hidden = true })
	end, {})
	vim.keymap.set("n", "<leader>fG", function()
		builtin.live_grep({ glob_pattern = vim.fn.input("Pattern: ") })
	end, {})
	vim.keymap.set("n", "<leader>fs", function()
		builtin.lsp_workspace_symbols({ query = vim.fn.input("Query: ") })
	end, {})
	vim.keymap.set("n", "<leader>/", builtin.current_buffer_fuzzy_find, {})
	vim.keymap.set("n", "<leader>:", builtin.commands, {})
	vim.keymap.set("n", "<leader>.", builtin.quickfix, {})
	vim.keymap.set("n", "<leader>g", builtin.lsp_definitions, {})
	vim.keymap.set("n", "<M-g>", builtin.lsp_definitions, {})
	vim.keymap.set("n", "<leader>G", function()
		builtin.lsp_references({ show_line = false })
	end, {})
	vim.keymap.set("n", "<leader>?k", ":Telescope keymaps<cr>")
end
