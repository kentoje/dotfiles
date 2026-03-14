return {
	"echasnovski/mini.nvim",
	config = function()
		local mini_ai = require("mini.ai")
		local mini_surround = require("mini.surround")
		-- local mini_comment = require("mini.comment")
		local mini_splitjoin = require("mini.splitjoin")

		mini_ai.setup({
			mappings = {
				around_last = "aB",
				inside_last = "iB",
			},
		})
		mini_splitjoin.setup()
		-- mini_comment.setup()
		mini_surround.setup()
	end,
}
