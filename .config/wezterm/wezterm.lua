local wezterm = require("wezterm")
local ui = require("ui")
local keymap = require("keymap")
local mousemap = require("mousemap")

-- This table will hold the configuration.
local config = {}
config.hyperlink_rules = wezterm.default_hyperlink_rules()

-- In newer versions of wezterm, use the config_builder which will
-- help provide clearer error messages
if wezterm.config_builder then
	config = wezterm.config_builder()
end

-- This is where you actually apply your config choices
ui.apply_to_config(config)
keymap.apply_to_config(config)
mousemap.apply_to_config(config)

return config
