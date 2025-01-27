local has_home_with_volumes = require("kentoje.helpers").has_home_with_volumes

local function random_number(min, max)
	-- Seed the random number generator
	math.randomseed(os.time())
	return math.random(min, max)
end

local function pick_random_jpg(directory)
	local handle = io.popen('ls -1 "' .. directory .. '"/*.jpg 2>/dev/null')

	if handle then
		local files = {}

		for file in handle:lines() do
			table.insert(files, file)
		end

		handle:close()

		if #files > 0 then
			local index = random_number(1, #files)

			return files[index]
		end
	end

	return nil
end

local image_path = has_home_with_volumes and "/Volumes/HomeX/kento/Pictures/wallpapers/samples"
	or "/Users/kento/Pictures/wallpapers/samples"
local image = pick_random_jpg(image_path)

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
					cmd = string.format("chafa --symbols vhalf --dither bayer --dither-grain 4 --stretch %s", image),
					height = 18,
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
