return {
	"folke/noice.nvim",
	event = "VeryLazy",
	opts = {
		-- add any options here
	},
	dependencies = {
		-- if you lazy-load any plugin below, make sure to add proper `module="..."` entries
		"MunifTanjim/nui.nvim",
		-- "rcarriga/nvim-notify",
	},
	config = function()
		require("noice").setup({
			lsp = {
				signature = {
					enabled = false,
				},
			},
		})
		-- require("notify").setup({
		-- 	background_colour = "#000000",
		-- })
	end,
}
