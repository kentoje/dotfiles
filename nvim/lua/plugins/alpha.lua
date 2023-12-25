return {
	"goolord/alpha-nvim",
	config = function()
		local dashboard = require("alpha.themes.dashboard")
		local ascii = require("ascii")
		dashboard.section.header.val = ascii.art.misc.krakens.krakedking
		dashboard.section.header.opts = {
			position = "center",
			hl = "AlphaHeader",
		}
		dashboard.section.buttons.val = {
			dashboard.button("e", "  New file", ":ene <BAR> startinsert <CR>"),
			dashboard.button("r", "  Recent files", ":Telescope oldfiles<CR>"),
			dashboard.button("f", "  Find file", ":Telescope find_files<CR>"),
			dashboard.button("q", "  Quit NVIM", ":qa<CR>"),
		}

		dashboard.config.opts.noautocmd = true

		require("alpha").setup(dashboard.config)
	end,
}
