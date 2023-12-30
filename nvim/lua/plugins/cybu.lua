return {
	"ghillb/cybu.nvim",
	event = "VeryLazy",
	branch = "main",
	dependencies = { "nvim-tree/nvim-web-devicons", "nvim-lua/plenary.nvim" },
	config = function()
		local ok, cybu = pcall(require, "cybu")

		if not ok then
			return
		end

		cybu.setup({
			style = {
				path = "tail",
				hide_buffer_id = true, -- hide buffer IDs in window
			},
			behavior = { -- set behavior for different modes
				mode = {
					default = {
						switch = "immediate", -- immediate, on_close
						view = "paging", -- paging, rolling
					},
					last_used = {
						switch = "on_close", -- immediate, on_close
						view = "paging", -- paging, rolling
					},
					auto = {
						view = "rolling",
					},
				},
				show_on_autocmd = false, -- event to trigger cybu (eg. "BufEnter")
			},
			display_time = 800, -- time in ms the cybu win is displayed
		})
		-- Kitty: Remove kitty map, and use leader syntax
		-- vim.keymap.set("n", "<M-h>", "<Plug>(CybuPrev)", { desc = "Cybu prev" })
		-- vim.keymap.set("n", "<M-l>", "<Plug>(CybuNext)", { desc = "Cybu next" })

		vim.keymap.set("n", "<leader>qh", "<Plug>(CybuPrev)", { desc = "Cybu prev" })
		vim.keymap.set("n", "<leader>ql", "<Plug>(CybuNext)", { desc = "Cybu next" })

		-- Kitty: Remove kitty map, and use leader syntax
		-- Kitty is sending F3 / F4 by pressing custom keymaps
		-- vim.keymap.set("n", "<F3>", "<Plug>(CybuPrev)", { desc = "Cybu prev" })
		-- vim.keymap.set("n", "<F4>", "<Plug>(CybuNext)", { desc = "Cybu next" })
	end,
}
