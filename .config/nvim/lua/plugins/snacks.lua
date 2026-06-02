return {
	"folke/snacks.nvim",
	priority = 1000,
	lazy = false,
	---@type snacks.Config
	opts = {
		-- your configuration comes here
		-- or leave it empty to use the default settings
		-- refer to the configuration section below
		bigfile = { enabled = true },
		terminal = {
			enabled = true,
		},
		bufdelete = { enabled = true },
		dashboard = {
			enabled = true,
			preset = {
				keys = {
					{
						icon = " ",
						key = "r",
						desc = "Recent Files",
						action = ":lua Snacks.dashboard.pick('oldfiles')",
					},
					{ icon = " ", key = "q", desc = "Quit", action = ":qa" },
				},
			},
			sections = {
				{
					section = "terminal",
					-- melange-themed gradient: 50% warm (magenta/red/yellow), 50% cool (green/cyan/blue)
					cmd = "lolcrab -c '#CF9BC2 0%,#D47766 17%,#EBC06D 33%,#85B695 50%,#89B3B6 67%,#A3A9CE 83%,#CF9BC2 100%' ~/dotfiles/.config/nvim/lua/headers/nvim.txt",
					height = 8,
					align = "center",
					indent = -6,
					padding = 2,
				},
				{ icon = " ", title = "Recent Files", section = "recent_files", indent = 2, padding = 1 },
				{ section = "startup" },
			},
		},
		notifier = { enabled = true, timeout = 2500, top_down = false },
		quickfile = { enabled = true },
		scratch = { enabled = true },
	},
	keys = {
		{
			"<leader>bs",
			function()
				Snacks.scratch()
			end,
			desc = "Toggle Scratch Buffer",
		},
		{
			"<leader>bS",
			function()
				Snacks.scratch.select()
			end,
			desc = "Select Scratch Buffer",
		},
	},
}
