if not vim.g.vscode then
	vim.opt.termguicolors = true

	vim.keymap.set("n", "<leader>wp", ":BufferPrevious<cr>", { silent = true })
	vim.keymap.set("n", "<leader>wn", ":BufferNext<cr>", { silent = true })
	vim.keymap.set("n", "<leader>wW", ":BufferClose<cr>", { silent = true })
	vim.keymap.set("n", "<leader>ww", ":close<cr>", { silent = true })
	--
	vim.keymap.set("n", "<leader>1", ":BufferGoto 1<cr>", { silent = true })
	vim.keymap.set("n", "<leader>2", ":BufferGoto 2<cr>", { silent = true })
	vim.keymap.set("n", "<leader>3", ":BufferGoto 3<cr>", { silent = true })
	vim.keymap.set("n", "<leader>4", ":BufferGoto 4<cr>", { silent = true })
	vim.keymap.set("n", "<leader>5", ":BufferGoto 5<cr>", { silent = true })
	vim.keymap.set("n", "<leader>6", ":BufferGoto 6<cr>", { silent = true })
	vim.keymap.set("n", "<leader>7", ":BufferGoto 7<cr>", { silent = true })
	vim.keymap.set("n", "<leader>8", ":BufferGoto 8<cr>", { silent = true })
	vim.keymap.set("n", "<leader>9", ":BufferGoto 9<cr>", { silent = true })
end
