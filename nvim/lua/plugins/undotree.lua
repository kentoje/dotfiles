return {
	"mbbill/undotree",
	event = "VeryLazy",
	config = function()
		vim.keymap.set("n", "<leader>xu", ":UndotreeToggle<CR>", { desc = "Resume telescope search" })
	end,
}
