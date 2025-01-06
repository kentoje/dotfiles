local function random_number(min, max)
	-- Seed the random number generator
	math.randomseed(os.time())
	return math.random(min, max)
end

local function count_jpg_files(directory)
	local handle = io.popen('ls -1 "' .. directory .. '"/*.jpg 2>/dev/null | wc -l')
	if handle then
		local result = handle:read("*n")
		handle:close()
		return result or 0
	end
	return 0
end

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
		bufdelete = { enabled = true },
		dashboard = {
			enabled = true,
			preset = {
				keys = {
					{ icon = " ", key = "f", desc = "Find File", action = ":lua Snacks.dashboard.pick('files')" },
					{
						icon = " ",
						key = "r",
						desc = "Recent Files",
						action = ":lua Snacks.dashboard.pick('oldfiles')",
					},
					{
						icon = " ",
						key = "s",
						desc = "Find Text",
						action = ":lua Snacks.dashboard.pick('live_grep')",
					},
					{
						icon = "󰒲 ",
						key = "L",
						desc = "Lazy",
						action = ":Lazy",
						enabled = package.loaded.lazy ~= nil,
					},
					{ icon = " ", key = "q", desc = "Quit", action = ":qa" },
				},
			},
			sections = {
				{
					section = "terminal",
					-- cmd = "clear; chafa --format symbols --symbols vhalf --size 60x17 --stretch /Users/kento/Pictures/wallpapers/abstract/Yellow\\ white.jpg",
					-- cmd = "clear; chafa --format symbols --symbols vhalf --size 60x20 --stretch /Users/kento/Pictures/samples/pp.jpg",
					cmd = string.format(
						"clear; chafa --symbols vhalf --stretch /Users/kento/Pictures/samples/%d.jpg",
						random_number(1, count_jpg_files("/Users/kento/Pictures/samples"))
					),
					height = 17,
					padding = 1,
				},

				{ icon = " ", title = "Recent Files", section = "recent_files", indent = 2, padding = 1 },
				{ icon = " ", title = "Keymaps", section = "keys", indent = 2, padding = 1 },
				-- { icon = " ", title = "Projects", section = "projects", indent = 2, padding = 1 },
				{ section = "startup" },
			},
		},
		-- input = { enabled = true },
		notifier = { enabled = true, timeout = 2500, top_down = false },
		quickfile = { enabled = true },
		-- statuscolumn = { enabled = true },
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
