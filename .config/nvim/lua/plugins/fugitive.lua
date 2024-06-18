return {
	"tpope/vim-fugitive",
	event = "VeryLazy",
	config = function()
		vim.keymap.set("n", "<leader>xgs", function()
			vim.cmd("vertical Git | vertical resize 80")
		end, { desc = "Git status" })

		vim.keymap.set("n", "<leader>xgd", function()
			vim.cmd("Gvdiff")
		end, { desc = "Git diff" })

		vim.keymap.set("n", "<leader>xgb", function()
			vim.cmd("Git blame")
		end, { desc = "Git blame" })

		vim.keymap.set("n", "<leader>xgh", function()
			vim.cmd("0Gclog")
		end, { desc = "Git history of file" })
	end,
}
