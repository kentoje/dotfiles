if not vim.g.vscode then
	require("mini.files").setup()

	vim.keymap.set("n", "<leader>-", ":lua MiniFiles.open()<CR>", { desc = "Open the mini files tree" })
end
