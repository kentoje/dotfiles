if not vim.g.vscode then
	require("telescope").setup({
		defaults = {
			file_ignore_patterns = {
				"node_modules",
				"yarn.lock",
				".yarn",
			},
		},
	})
	local builtin = require("telescope.builtin")

	vim.keymap.set("n", "<leader>P", vim.cmd.Ex)
	vim.keymap.set("n", "<leader>p", builtin.git_files, {})
	vim.keymap.set("n", "<leader>ff", builtin.find_files, {})
	vim.keymap.set("n", "<leader>fb", builtin.buffers, {})
	vim.keymap.set("n", "<leader>fc", builtin.grep_string, {})
	-- vim.keymap.set("n", "<leader>fg", function()
	-- 	builtin.grep_string({ search = vim.fn.input("Grep > ") })
	-- end)
	vim.keymap.set("n", "<leader>fg", builtin.live_grep, {})
	vim.keymap.set("n", "<leader>?k", ":Telescope keymaps<cr>")
end
