return {
	"j-morano/buffer_manager.nvim",
	dependencies = {
		"nvim-lua/plenary.nvim",
	},
	config = function()
		require("buffer_manager").setup({
			line_keys = "1234567890",
			select_menu_item_commands = {
				edit = {
					key = "<CR>",
					command = "edit",
				},
			},
			width = 200,
			height = 20,
			focus_alternate_buffer = false,
			short_file_names = false,
			short_term_names = true,
			loop_nav = true,
			highlight = "",
			win_extra_options = {},
			borderchars = { "─", "│", "─", "│", "╭", "╮", "╯", "╰" },
		})

		vim.keymap.set("n", "<leader>qb", function()
			require("buffer_manager.ui").toggle_quick_menu()
		end, { silent = true, noremap = true })
	end,
}
