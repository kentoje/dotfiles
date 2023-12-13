return {
	"ThePrimeagen/harpoon",
	branch = "harpoon2",
	dependencies = {
		{ "nvim-lua/plenary.nvim" },
	},
	config = function()
		local harpoon = require("harpoon")
		harpoon.setup({
			settings = { save_on_toggle = true, sync_on_ui_close = true },
		})

		vim.keymap.set("n", "<leader>a", function()
			harpoon:list():append()
		end, { desc = "Add file to harpoon" })

		vim.keymap.set("n", "<leader>A", function()
			harpoon:list():remove()
		end, { desc = "Remove file from harpoon" })
		vim.keymap.set("n", "<leader>xa", function()
			harpoon:list():clear()
		end, { desc = "Remove all files from harpoon" })

		vim.keymap.set("n", "<C-space>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list())
		end, { desc = "Display harpoon menu" })

		-- vim.keymap.set("n", "<leader>h", function()
		-- 	harpoon:list():prev()
		-- end, { desc = "Go to prev harpoon file" })
		--
		-- vim.keymap.set("n", "<leader>l", function()
		-- 	harpoon:list():next()
		-- end, { desc = "Go to next harpoon file" })

		-- vim.keymap.set("n", "<leader>1", function()
		-- 	harpoon:list():select(1)
		-- end)
		-- vim.keymap.set("n", "<leader>2", function()
		-- 	harpoon:list():select(2)
		-- end)
		-- vim.keymap.set("n", "<leader>3", function()
		-- 	harpoon:list():select(3)
		-- end)
		-- vim.keymap.set("n", "<leader>4", function()
		-- 	harpoon:list():select(4)
		-- end)
		-- vim.keymap.set("n", "<leader>5", function()
		-- 	harpoon:list():select(5)
		-- end)
		-- vim.keymap.set("n", "<leader>6", function()
		-- 	harpoon:list():select(6)
		-- end)
		-- vim.keymap.set("n", "<leader>7", function()
		-- 	harpoon:list():select(7)
		-- end)
		-- vim.keymap.set("n", "<leader>8", function()
		-- 	harpoon:list():select(8)
		-- end)
		-- vim.keymap.set("n", "<leader>9", function()
		-- 	harpoon:list():select(9)
		-- end)
	end,
}
