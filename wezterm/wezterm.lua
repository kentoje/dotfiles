-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This table will hold the configuration.
local config = {}

config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
	config = wezterm.config_builder()
end

-- This is where you actually apply your config choices

config.color_scheme = "Catppuccin Macchiato"
config.colors = {
	cursor_bg = "#f5bde6",
}
config.window_padding = {
	left = 12,
	right = 12,
	top = 12,
	bottom = 12,
}
config.font = wezterm.font("SFMono Nerd Font", { weight = "Bold" })
config.font_size = 14.0
config.cell_width = 0.8
config.line_height = 1.0
config.enable_tab_bar = false
config.window_decorations = "RESIZE"
config.window_close_confirmation = "NeverPrompt"
config.max_fps = 120
config.use_ime = false
config.leader = { key = "b", mods = "CTRL", timeout_milliseconds = 1000 }
config.mouse_bindings = {
	-- Ctrl-click will open the link under the mouse cursor
	{
		event = { Up = { streak = 1, button = "Left" } },
		mods = "SUPER",
		action = wezterm.action.OpenLinkAtMouseCursor,
	},
}
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

local assets = wezterm.config_dir .. "/assets"

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
-- config.window_background_image = "/Users/kento/Movies/background/nikita_1.mp4"
-- config.text_background_opacity = 0.3
-- config.window_background_image_hsb = {
--   -- Darken the background image by reducing it to 1/3rd
--   brightness = 0.3,
--
--   -- You can adjust the hue by scaling its value.
--   -- a multiplier of 1.0 leaves the value unchanged.
--   hue = 1.0,
--
--   -- You can adjust the saturation also.
--   saturation = 1.0,
-- }

return config
