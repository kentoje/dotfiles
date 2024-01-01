return {
	"numToStr/Comment.nvim",
	config = function()
		require("Comment").setup()

		local ft = require("Comment.ft")
		local api = require("Comment.api")
		ft.set("json", "//%s")

		vim.keymap.set(
			"n",
			"<leader>q/",
			api.call("toggle.linewise.current", "g@$"),
			{ expr = true, desc = "Comment the current line" }
		)
		vim.keymap.set("x", "<leader>q/", "<Plug>(comment_toggle_linewise_visual)")
	end,
}
