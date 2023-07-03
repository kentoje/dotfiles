if not vim.g.vscode then
	local neotest = require('neotest')

	neotest.setup({
		adapters = {
			require('neotest-jest')({
				jestCommand = "yarn jest -o",
				cwd = function(path)
					return vim.fn.getcwd()
				end,
			}),
		}
	})

	vim.api.nvim_set_keymap("n", "<leader>ta", "<cmd>lua require('neotest').run.run(vim.fn.expand('%'))<cr>", {})
	vim.api.nvim_set_keymap("n", "<leader>tc", "<cmd>lua require('neotest').run.run()<cr>", {})
	-- does not watch for some reason
	-- vim.api.nvim_set_keymap("n", "<leader>tw", "<cmd>lua neotest.run.run({ jestCommand = 'yarn jest --watch' })<cr>", {})
	vim.api.nvim_set_keymap("n", "<leader>tt", "<cmd>lua require('neotest').summary.toggle()<cr>", {})
	vim.api.nvim_set_keymap("n", "<leader>to", "<cmd>lua require('neotest').output.open({ enter = true })<cr>", {})
end

