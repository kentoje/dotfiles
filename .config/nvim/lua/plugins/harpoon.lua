return {
	"ThePrimeagen/harpoon",
	config = function()
		local mark = require("harpoon.mark")
		local ui = require("harpoon.ui")

		require("harpoon").setup({
			menu = {
				width = vim.api.nvim_win_get_width(0) - 32,
			},
		})

		vim.keymap.set("n", "<leader>a", mark.add_file, { desc = "Add file to harpoon" })
		-- vim.keymap.set("n", "<C-A>", mark.rm_file, { desc = "Remove file from harpoon" })
		-- vim.keymap.set("n", "<leader>xa", mark.clear_all, { desc = "Remove all files from harpoon" })

		vim.keymap.set("n", "<leader>qb", ui.toggle_quick_menu, { desc = "Display harpoon menu" })

		-- vim.keymap.set("n", "<C-1>", function()
		-- 	ui.nav_file(1)
		-- end)
		-- vim.keymap.set("n", "<C-2>", function()
		-- 	ui.nav_file(2)
		-- end)
		-- vim.keymap.set("n", "<C-3>", function()
		-- 	ui.nav_file(3)
		-- end)
		-- vim.keymap.set("n", "<C-4>", function()
		-- 	ui.nav_file(4)
		-- end)
		-- vim.keymap.set("n", "<C-5>", function()
		-- 	ui.nav_file(5)
		-- end)
		-- vim.keymap.set("n", "<C-6>", function()
		-- 	ui.nav_file(6)
		-- end)
		-- vim.keymap.set("n", "<C-7>", function()
		-- 	ui.nav_file(7)
		-- end)
		-- vim.keymap.set("n", "<C-8>", function()
		-- 	ui.nav_file(8)
		-- end)
		-- vim.keymap.set("n", "<C-9>", function()
		-- 	ui.nav_file(9)
		-- end)
	end,
}