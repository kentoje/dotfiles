return {
	"echasnovski/mini.nvim",
	config = function()
		local mini_ai = require("mini.ai")
		-- local mini_comment = require("mini.comment")
		local mini_splitjoin = require("mini.splitjoin")
		local mini_surround = require("mini.surround")

		mini_ai.setup({
			mappings = {
				around_last = "aB",
				inside_last = "iB",
			},
		})
		mini_splitjoin.setup()
		mini_surround.setup()
	end,
}
