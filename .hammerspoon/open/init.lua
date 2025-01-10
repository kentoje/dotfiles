local function bind_app(key, app_path)
	hs.hotkey.bind({ "alt" }, key, function()
		return hs.application.open(app_path)
	end)
end

-- local toggleFocus = function(appName)
-- 	local app = hs.application.get(appName)
--
-- 	if app then
-- 		if app:isFrontmost() then
-- 			app:hide()
-- 		else
-- 			app:activate()
-- 		end
-- 	else
-- 		hs.application.launchOrFocus(appName)
-- 	end
-- end

hs.hotkey.bind({ "alt" }, "e", function()
	hs.execute("open -a Finder")
end)

bind_app("t", "/Applications/Ghostty.app")
bind_app("g", "/Applications/Arc.app")
bind_app("m", "/Applications/Spotify.app")
bind_app("s", "/Applications/Slack.app")
bind_app("f", "/Applications/Figma.app")
bind_app("c", "/Applications/Rise.app")
bind_app("z", "/Applications/zoom.us.app")
bind_app("d", "/Applications/Tayasui Sketches.app")
bind_app("w", "/Applications/WhatsApp.app")
bind_app("b", "/Applications/Spark.app")

-- for _, item in ipairs({
-- 	{ "t", "Ghostty" },
-- 	{ "g", "Arc.app" },
-- 	{ "m", "Spotify" },
-- 	{ "s", "Slack" },
-- 	{ "f", "Figma" },
-- 	{ "c", "Rise" },
-- 	{ "z", "zoom.us" },
-- 	{ "d", "Tayasui Sketches" },
-- 	{ "w", "WhatsApp" },
-- 	{ "b", "Spark" },
-- }) do
-- 	hs.hotkey.bind({ "alt" }, item[1], function()
-- 		toggleFocus(item[2])
-- 	end)
-- end
