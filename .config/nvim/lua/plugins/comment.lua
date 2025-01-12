return {
	"numToStr/Comment.nvim",
	dependencies = {
		"JoosepAlviste/nvim-ts-context-commentstring",
	},
	config = function()
		-- Required to avoid the weird navigation bug where cursor moves at wrong position
		require("ts_context_commentstring").setup({
			enable_autocmd = false,
		})

		-- Enable jsx commenting
		require("Comment").setup({
			pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
		})

		local ft = require("Comment.ft")
		local api = require("Comment.api")
		ft.set("json", "//%s")
	end,
}
