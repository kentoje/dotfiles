return {
	"folke/todo-comments.nvim",
	dependencies = { "nvim-lua/plenary.nvim" },
	opts = {},
	config = function(_, opts)
		local todo_comments = require("todo-comments")
		todo_comments.setup(opts)

		vim.keymap.set("n", "]t", function()
			todo_comments.jump_next()
		end, { desc = "Next todo comment" })

		vim.keymap.set("n", "[t", function()
			todo_comments.jump_prev()
		end, { desc = "Previous todo comment" })

		vim.keymap.set(
			"n",
			"<leader>xtt",
			":TodoTelescope<CR>",
			{ desc = "Display telescope list of todos", silent = true }
		)
	end,
}
