local wezterm = require("wezterm")

local module = {}

function module.apply_to_config(config)
	local assets = wezterm.config_dir .. "/assets"

	config.color_scheme = "Catppuccin Macchiato"
	config.colors = {
		cursor_bg = "#f5bde6",
	}
	config.font = wezterm.font("SFMono Nerd Font", { weight = 600 }) -- 600 -> Semibold
	config.font_size = 14.0
	config.cell_width = 0.8
	config.line_height = 1.0
	config.max_fps = 100
	config.use_ime = false

	config.enable_tab_bar = false
	config.window_decorations = "RESIZE"
	config.window_close_confirmation = "NeverPrompt"
	config.window_padding = {
		left = 12,
		right = 12,
		top = 12,
		bottom = 12,
	}
	config.window_background_opacity = 0.85
	config.macos_window_background_blur = 20
	config.background = {
		{
			source = {
				File = { path = assets .. "/5.webp" },
			},
			repeat_x = "Mirror",
			-- width = "100%",
			-- height = "100%",
			opacity = 0.3,
			-- opacity = 1,
			-- hsb = {
			-- 	hue = 0.9,
			-- 	saturation = 0.9,
			-- 	brightness = 0.8,
			-- },
		},
		{
			source = {
				Color = "1e2030",
			},
			width = "100%",
			height = "100%",
			opacity = 0.8,
		},
	}
end

return module
