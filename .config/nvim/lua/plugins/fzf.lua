return {
	"ibhagwan/fzf-lua",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	priority = 2000,
	lazy = false,
	config = function()
		local fzf = require("fzf-lua")
		fzf.setup({
			files = {
				formatter = "path.filename_first",
				git_icons = true,
			},
			winopts = {
				width = 0.95,
				height = 0.85,
				border = "rounded",
				preview = {
					delay = 10,
				},
			},
		})

		vim.keymap.set("n", "gp", function()
			fzf.files({
				hidden = true,
				-- path_shorten = 1,
				-- cmd = "fd",
				-- fd_opts = [[--color=never --type f --hidden --follow --exclude .git]],
			})
		end, { desc = "Find files" })
		-- vim.keymap.set("n", "<leader>qp", function()
		-- 	fzf.files({
		-- 		hidden = true,
		-- 		path_shorten = 1,
		-- 		-- cmd = "fd",
		-- 		-- fd_opts = [[--color=never --type f --hidden --follow --exclude .git]],
		-- 	})
		-- end, { desc = "Find files" })

		vim.keymap.set("n", "<leader>fr", function()
			fzf.resume()
		end, { desc = "Resume fzf" })

		vim.keymap.set("n", "<leader>fb", function()
			fzf.buffers()
		end, { desc = "List buffers" })

		vim.keymap.set("n", "<leader>fg", function()
			fzf.live_grep_native()
		end, { desc = "Search for pattern" })

		vim.keymap.set("n", "<leader>fc", function()
			fzf.grep_cword()
		end, { desc = "Search for current word" })

		vim.keymap.set("v", "/", function()
			fzf.grep_visual()
		end, { desc = "Search for current selection" })

		-- vim.keymap.set("n", "<leader>G", function()
		-- 	fzf.lsp_references()
		-- end, { desc = "Find references" })
		vim.keymap.set("n", "<leader>:", function()
			fzf.commands()
		end, { desc = "Display commands" })
		vim.keymap.set("n", "<leader>?k", function()
			fzf.keymaps()
		end, { desc = "Display all keymaps" })
	end,
}
