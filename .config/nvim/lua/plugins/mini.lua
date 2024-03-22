return {
	"echasnovski/mini.nvim",
	config = function()
		local mini_files = require("mini.files")
		local mini_ai = require("mini.ai")
		-- local mini_animate = require("mini.animate")

		mini_files.setup({
			mappings = {
				close = "<ESC>",
			},
		})
		mini_ai.setup()

		vim.keymap.set("n", "<leader>-", function()
			-- minifiles.open(vim.api.nvim_buf_get_name(0), false) -- cwd with new state
			mini_files.open(vim.api.nvim_buf_get_name(0)) -- cwd but same state
		end, { noremap = true })
	end,
}
