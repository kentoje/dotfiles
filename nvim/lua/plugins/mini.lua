return {
	"echasnovski/mini.nvim",
	config = function()
		local minifiles = require("mini.files")

		minifiles.setup()
		vim.keymap.set("n", "<leader>-", function()
			-- minifiles.open(vim.api.nvim_buf_get_name(0), false) -- cwd with new state
			minifiles.open(vim.api.nvim_buf_get_name(0)) -- cwd but same state
		end, { noremap = true })
	end,
}
