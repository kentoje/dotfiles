return {
	"nvim-telescope/telescope.nvim",
	version = "0.1.x",
	cmd = "Telescope",
	dependencies = { "nvim-lua/plenary.nvim", "nvim-tree/nvim-web-devicons" },
	config = function()
		local telescope = require("telescope")
		local actions = require("telescope.actions")

		telescope.setup({
			defaults = {
				-- vimgrep_arguments = {
				-- 	"rg",
				-- 	"--color=never",
				-- 	"--no-heading",
				-- 	"--with-filename",
				-- 	"--line-number",
				-- 	"--column",
				-- 	"--smart-case",
				-- 	"--no-ignore",
				-- 	"--hidden",
				-- 	"-g",
				-- 	"!node_modules/*",
				-- 	"-g",
				-- 	"!.yarn",
				-- 	"-g",
				-- 	"!.git/logs",
				-- 	"-g",
				-- 	"!type-docs",
				-- 	"-g",
				-- 	"!build",
				-- 	"-g",
				-- 	"!local-build",
				-- 	"-g",
				-- 	"!storybook-static",
				-- 	"-g",
				-- 	"!coverage/*",
				-- 	"-g",
				-- 	"!test-results/*",
				-- },
				file_ignore_patterns = {
					"coverage",
					".cache",
					"node_modules",
					"yarn.lock",
					".yarn",
					".git/",
				},
				path_display = { "absolute" },
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
				mappings = {
					i = {
						["<C-j>"] = actions.move_selection_next, -- Rebind next item in insert mode
						["<C-k>"] = actions.move_selection_previous, -- Rebind previous item in insert mode
					},
				},
			},
		})

		-- local builtin = require("telescope.builtin")

		-- local find_command = {
		-- 	"rg",
		-- 	"--files",
		-- 	"--no-ignore",
		-- 	"--hidden",
		-- 	"-g",
		-- 	"!node_modules/*",
		-- 	"-g",
		-- 	"!.yarn",
		-- 	"-g",
		-- 	"!.git/logs",
		-- 	"-g",
		-- 	"!type-docs",
		-- 	"-g",
		-- 	"!build",
		-- 	"-g",
		-- 	"!local-build",
		-- 	"-g",
		-- 	"!storybook-static",
		-- 	"-g",
		-- 	"!coverage/*",
		-- 	"-g",
		-- 	"!test-results/*",
		-- }

		-- local find_command = {
		-- 	"rg",
		-- 	"--files",
		-- 	"--hidden",
		-- }
		--
		-- vim.keymap.set("n", "gp", function()
		-- 	builtin.find_files({
		-- 		hidden = true,
		-- 		find_command = find_command,
		-- 	})
		-- end, { desc = "Find git files" })
		-- vim.keymap.set("n", "<leader>fb", builtin.buffers, { desc = "Displays all current buffers" })
		-- vim.keymap.set("n", "<leader>ff", function()
		-- 	builtin.find_files({
		-- 		hidden = true,
		-- 		no_ignore = true,
		-- 	})
		-- end, { desc = "Find all files" })
		-- vim.keymap.set("n", "<leader>fg", function()
		-- 	builtin.live_grep({
		-- 		hidden = true,
		-- 	})
		-- end, { desc = "Search for a regex pattern in the project" })
		-- vim.keymap.set("n", "<leader>fr", function()
		-- 	builtin.resume()
		-- end, { desc = "Resume telescope search" })
		-- vim.keymap.set("n", "<leader>:", builtin.commands, {})
		-- vim.keymap.set("n", "<leader>?k", ":Telescope keymaps<cr>", { desc = "Display all keymaps" })
		-- vim.keymap.set("n", "<leader>fs", function()
		-- 	builtin.lsp_workspace_symbols({ query = vim.fn.input("Query: ") })
		-- end, { desc = "Find given symbol" })
	end,
}
