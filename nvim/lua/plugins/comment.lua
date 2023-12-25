return {
	"numToStr/Comment.nvim",
	config = function()
		require("Comment").setup()

		local ft = require("Comment.ft")
		local api = require("Comment.api")
		ft.set("json", "//%s")

		-- Kitty: Change kitty binds
		-- vim.keymap.set(
		-- 	"n",
		-- 	"<M-/>",
		-- 	api.call("toggle.linewise.current", "g@$"),
		-- 	{ expr = true, desc = "Comment the current line" }
		-- )
		vim.keymap.set(
			"n",
			"<leader>q/",
			api.call("toggle.linewise.current", "g@$"),
			{ expr = true, desc = "Comment the current line" }
		)
		vim.keymap.set("x", "<C-/>", "<Plug>(comment_toggle_linewise_visual)")
	end,
}
