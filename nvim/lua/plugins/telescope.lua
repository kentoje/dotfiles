return {
	"nvim-telescope/telescope.nvim",
	version = "0.1.x",
	cmd = {
		"Telescope",
	},
	dependencies = { "nvim-lua/plenary.nvim" },
	config = function()
		local telescope = require("telescope")

		telescope.load_extension("harpoon")
		telescope.load_extension("neoclip")

		telescope.setup({
			defaults = {
				vimgrep_arguments = {
					"rg",
					"--color=never",
					"--no-heading",
					"--with-filename",
					"--line-number",
					"--column",
					"--smart-case",
					"--no-ignore",
					"--hidden",
					"-g",
					"!node_modules/*",
					"-g",
					"!.yarn",
					"-g",
					"!.git/logs",
				},
				file_ignore_patterns = {
					"coverage",
					".cache",
					"node_modules",
					"yarn.lock",
					".yarn",
					".git/",
				},
				path_display = { "smart" },
				preview = true,
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
		local wk = require("which-key")

		wk.register({
			f = {
				name = "file", -- optional group name
				f = {
					function()
						builtin.find_files({
							hidden = true,
							no_ignore = true,
						})
					end,
					"Find all files",
				}, -- create a binding with label
			},
		}, { prefix = "<leader>" })

		-- vim.keymap.set("n", "<leader>p", function()
		-- 	builtin.find_files({ hidden = true })
		-- end, { desc = "Find git files" })

		local find_command = {
			"rg",
			"--files",
			"--no-ignore",
			"--hidden",
			"-g",
			"!node_modules/*",
			"-g",
			"!.yarn",
			"-g",
			"!.git/logs",
		}

		vim.keymap.set("n", "<C-p>", function()
			builtin.find_files({
				hidden = true,
				find_command = find_command,
			})
		end, { desc = "Find git files" })
		vim.keymap.set("n", "<M-p>", function()
			builtin.find_files({
				hidden = true,
				find_command = find_command,
			})
		end, { desc = "Find git files" })
		-- vim.keymap.set("n", ";", function()
		-- 	builtin.find_files({ hidden = true })
		-- end, { desc = "Find git files" })
		-- vim.keymap.set("n", "<leader>ff", function()
		-- 	builtin.find_files({ hidden = true, no_ignore = true })
		-- end, { desc = "Find all files, non git included" })
		vim.keymap.set("n", "<leader>fb", builtin.buffers, { desc = "Displays all current buffers" })
		-- vim.keymap.set("n", "<leader>fc", builtin.grep_string, { desc = "Search for a given pattern in the project" })
		vim.keymap.set("n", "<leader>fg", function()
			builtin.live_grep({
				hidden = true,
			})
		end, { desc = "Search for a regex pattern in the project" })
		-- vim.keymap.set("n", "<leader>fG", function()
		-- 	builtin.live_grep({ glob_pattern = vim.fn.input("Pattern: ") })
		-- end, {})
		vim.keymap.set("n", "<leader>fs", function()
			builtin.lsp_workspace_symbols({ query = vim.fn.input("Query: ") })
		end, { desc = "Find given symbol" })
		-- vim.keymap.set("n", "<leader>/", builtin.current_buffer_fuzzy_find, {})
		vim.keymap.set("n", "<leader>:", builtin.commands, {})
		-- vim.keymap.set("n", "<leader>.", builtin.quickfix, {})
		-- vim.keymap.set("n", "<leader>g", builtin.lsp_definitions, { desc = "Go to definition" })
		-- vim.keymap.set("n", "<M-g>", builtin.lsp_definitions, { desc = "Go to definition" })
		-- vim.keymap.set("n", "<leader>G", function()
		-- 	builtin.lsp_references({ show_line = false })
		-- end, { desc = "Search for all references" })
		vim.keymap.set("n", "<leader>?k", ":Telescope keymaps<cr>", { desc = "Display all keymaps" })
	end,
}
