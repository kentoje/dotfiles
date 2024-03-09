local wezterm = require("wezterm")

local module = {}

function module.apply_to_config(config)
	config.mouse_bindings = {
		{
			event = { Up = { streak = 1, button = "Left" } },
			mods = "SUPER",
			action = wezterm.action.OpenLinkAtMouseCursor,
		},
	}
end

return module
