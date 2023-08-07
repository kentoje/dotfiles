if not vim.g.vscode then
	local gitlinker = require("gitlinker")
	gitlinker.setup({
		mappings = nil,
	})

	vim.keymap.set(
		"n",
		"<leader>xy",
		'<cmd>lua require"gitlinker".get_buf_range_url("n", {action_callback = require"gitlinker.actions".open_in_browser})<cr>',
		{ silent = true }
	)
end
