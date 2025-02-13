return {
	"echasnovski/mini.nvim",
	config = function()
		local mini_files = require("mini.files")
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
		mini_files.setup({
			mappings = {
				close = "<ESC>",
			},
		})

		vim.keymap.set("n", "<leader>-", function()
			-- minifiles.open(vim.api.nvim_buf_get_name(0), false) -- cwd with new state
			mini_files.open(vim.api.nvim_buf_get_name(0)) -- cwd but same state
		end, { noremap = true })
	end,
}
