local toggleFocus = function(appName)
	local app = hs.application.get(appName)

	if app then
		if app:isFrontmost() then
			app:hide()
		else
			app:activate()
		end
	else
		hs.application.launchOrFocus(appName)
	end
end

hs.hotkey.bind({ "alt" }, "e", function()
	hs.execute("open -a Finder")
end)

for _, item in ipairs({
	{ "t", "Ghostty" },
	{ "g", "Arc" },
	{ "m", "Spotify" },
	{ "s", "Slack" },
	{ "f", "Figma" },
	{ "c", "Rise" },
	{ "z", "zoom.us" },
	{ "d", "Tayasui Sketches" },
	{ "w", "WhatsApp" },
	{ "b", "Spark" },
}) do
	hs.hotkey.bind({ "alt" }, item[1], function()
		toggleFocus(item[2])
	end)
end
