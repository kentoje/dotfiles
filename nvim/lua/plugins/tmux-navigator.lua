return {
	"christoomey/vim-tmux-navigator",
	config = function()
		vim.g.tmux_navigator_save_on_switch = 1

		vim.keymap.set("n", "<C-h>", ":TmuxNavigateLeft<cr>", { silent = true })
		vim.keymap.set("n", "<C-j>", ":TmuxNavigateDown<cr>", { silent = true })
		vim.keymap.set("n", "<C-k>", ":TmuxNavigateUp<cr>", { silent = true })
		vim.keymap.set("n", "<C-l>", ":TmuxNavigateRight<cr>", { silent = true })
	end,
}
