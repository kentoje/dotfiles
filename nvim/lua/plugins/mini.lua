return {
	"echasnovski/mini.nvim",
	config = function()
		require("mini.files").setup()
		vim.keymap.set("n", "<leader>-", ":lua MiniFiles.open()<CR>", { desc = "Open the mini files tree" })
	end,
}
