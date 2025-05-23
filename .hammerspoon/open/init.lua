local function focus_app(app_name)
	local app = hs.application.get(app_name)

	if not app then
		hs.application.launchOrFocus(app_name)
		return
	end

	if app:isFrontmost() then
		app:hide()
	else
		hs.application.launchOrFocus(app_name)
	end
end

local function bind_app(key, app_name)
	hs.hotkey.bind({ "alt" }, key, function()
		return focus_app(app_name)
	end)
end

hs.hotkey.bind({ "alt" }, "x", function()
	return hs.execute("open -a 'Finder'")
end)

bind_app("t", "Ghostty")
-- bind_app("g", "Zen Browser")
-- bind_app("g", "Vivaldi")
bind_app("g", "Arc")
bind_app("m", "Spotify")
bind_app("s", "Slack")
bind_app("f", "Figma")
bind_app("c", "Notion Calendar")
bind_app("d", "Freeform")
bind_app("w", "WhatsApp")
bind_app("v", "Cursor")
bind_app("b", "Repo Prompt")
