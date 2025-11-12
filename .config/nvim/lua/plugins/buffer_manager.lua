return {
	"j-morano/buffer_manager.nvim",
	dependencies = "nvim-lua/plenary.nvim",
	config = function()
		local bmui = require("buffer_manager.ui")
		require("buffer_manager").setup({})

		vim.keymap.set("n", "_", bmui.toggle_quick_menu, { desc = "Toggle Bufferin" })
		-- vim.keymap.set({ "t", "n" }, "<leader>bb", bmui.toggle_quick_menu)
	end,
}
