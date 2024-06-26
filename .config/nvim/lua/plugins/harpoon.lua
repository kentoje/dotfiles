return {
	"ThePrimeagen/harpoon",
	-- This might cause issues with the current setup.
	branch = "harpoon2",
	dependencies = { "nvim-lua/plenary.nvim" },
	config = function()
		local harpoon = require("harpoon")
		-- local mark = require("harpoon.mark")
		-- local ui = require("harpoon.ui")
		-- {
		-- 			menu = {
		-- 				width = vim.api.nvim_win_get_width(0) - 32,
		-- 			},
		-- 		}

		harpoon:setup({
			settings = {
				save_on_toggle = true,
			},
		})

		-- vim.keymap.set("n", "<leader>a", mark.add_file, { desc = "Add file to harpoon" })
		-- vim.keymap.set("n", "<C-A>", mark.rm_file, { desc = "Remove file from harpoon" })
		-- vim.keymap.set("n", "<leader>xa", mark.clear_all, { desc = "Remove all files from harpoon" })

		vim.keymap.set("n", "<leader>a", function()
			harpoon:list():add()
		end, { desc = "Add file to harpoon" })

		vim.keymap.set("n", "<leader><leader>", function()
			harpoon.ui:toggle_quick_menu(harpoon:list())
		end, { desc = "Display harpoon menu" })

		vim.keymap.set("n", "<leader>1", function()
			harpoon:list():select(1)
		end)
		vim.keymap.set("n", "<leader>2", function()
			harpoon:list():select(2)
		end)
		vim.keymap.set("n", "<leader>3", function()
			harpoon:list():select(3)
		end)
		vim.keymap.set("n", "<leader>4", function()
			harpoon:list():select(4)
		end)
		vim.keymap.set("n", "<leader>5", function()
			harpoon:list():select(5)
		end)
		vim.keymap.set("n", "<leader>6", function()
			harpoon:list():select(6)
		end)
		vim.keymap.set("n", "<leader>7", function()
			harpoon:list():select(7)
		end)
		vim.keymap.set("n", "<leader>8", function()
			harpoon:list():select(8)
		end)
		vim.keymap.set("n", "<leader>9", function()
			harpoon:list():select(9)
		end)
	end,
}
