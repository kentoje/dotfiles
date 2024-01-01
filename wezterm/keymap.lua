local wezterm = require("wezterm")

local module = {}

function module.apply_to_config(config)
	config.leader = { key = "b", mods = "CTRL", timeout_milliseconds = 1000 }
	config.keys = {
		{
			key = "m",
			mods = "CMD",
			action = wezterm.action.DisableDefaultAssignment,
		},
		{
			key = "h",
			mods = "CMD",
			action = wezterm.action.DisableDefaultAssignment,
		},
		{
			key = "o",
			mods = "SUPER",
			action = wezterm.action.QuickSelectArgs({
				label = "Open url",
				patterns = { "https?://\\S+" },
				action = wezterm.action_callback(function(window, pane)
					local url = window:get_selection_text_for_pane(pane)
					wezterm.open_with(url)
				end),
			}),
		},
		-- Tmux forward keybinds
		{ key = "d", mods = "SUPER", action = wezterm.action.SendString("\x01%") },
		{ key = "d", mods = "SUPER | SHIFT", action = wezterm.action.SendString('\x01"') },
		{ key = "w", mods = "SUPER", action = wezterm.action.SendString("\x01x") },
		{ key = "[", mods = "SUPER", action = wezterm.action.SendString("\x01[0") },
		{ key = "z", mods = "SUPER", action = wezterm.action.SendString("\x01z") },
		{ key = "t", mods = "SUPER", action = wezterm.action.SendString("\x01c") },
		{ key = "1", mods = "SUPER", action = wezterm.action.SendString("\x011") },
		{ key = "2", mods = "SUPER", action = wezterm.action.SendString("\x012") },
		{ key = "3", mods = "SUPER", action = wezterm.action.SendString("\x013") },
		{ key = "4", mods = "SUPER", action = wezterm.action.SendString("\x014") },
		{ key = "5", mods = "SUPER", action = wezterm.action.SendString("\x015") },
		{ key = "6", mods = "SUPER", action = wezterm.action.SendString("\x016") },
		{ key = "7", mods = "SUPER", action = wezterm.action.SendString("\x017") },
		{ key = "8", mods = "SUPER", action = wezterm.action.SendString("\x018") },
		{ key = "9", mods = "SUPER", action = wezterm.action.SendString("\x019") },

		-- Nvim forward keybinds
		{ key = "e", mods = "SUPER | SHIFT", action = wezterm.action.SendString("\x20\x71\x68") },
		{ key = "e", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x6C") },
		{ key = "g", mods = "SUPER | SHIFT", action = wezterm.action.SendString("\x20\x47") },
		{ key = "g", mods = "CTRL | SHIFT", action = wezterm.action.SendString("\x20\x47") },
		{ key = "p", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x70") },
		{ key = "b", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x62") },
		{ key = "s", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x73") },
		{ key = "g", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x67") },
		{ key = "h", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x68") },
		{ key = "j", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x6A") },
		{ key = "k", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x6B") },
		{ key = "l", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x6C") },
		{ key = "/", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x2F") },
		{ key = ".", mods = "SUPER", action = wezterm.action.SendString("\x20\x71\x2E") },
		{ key = "1", mods = "CTRL", action = wezterm.action.SendString("\x20\x31") },
		{ key = "2", mods = "CTRL", action = wezterm.action.SendString("\x20\x32") },
		{ key = "3", mods = "CTRL", action = wezterm.action.SendString("\x20\x33") },
		{ key = "4", mods = "CTRL", action = wezterm.action.SendString("\x20\x34") },
		{ key = "5", mods = "CTRL", action = wezterm.action.SendString("\x20\x35") },
	}
end

return module
