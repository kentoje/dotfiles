-- Send message(s) to a running instance of yabai.
local function yabai(commands)
	for _, cmd in ipairs(commands) do
		os.execute("/run/current-system/sw/bin/yabai -m " .. cmd)
	end
end

local function alt(key, commands)
	hs.hotkey.bind({ "alt" }, key, function()
		yabai(commands)
	end)
end

local function altShift(key, commands)
	hs.hotkey.bind({ "alt", "shift" }, key, function()
		yabai(commands)
	end)
end

local function altShiftNumber(number)
	altShift(number, { "window --space " .. number, "space --focus " .. number })
end

for i = 1, 9 do
	local num = tostring(i)
	alt(num, { "space --focus " .. num })
	altShiftNumber(num)
end

-- alpha
-- alt("f", { "window --toggle zoom-fullscreen" })
-- alt("l", { "space --focus recent" })
-- alt("m", { "space --toggle mission-control" })
-- alt("p", { "window --toggle pip" })
-- alt("g", { "space --toggle padding", "space --toggle gap" })
-- alt("r", { "space --rotate 90" })
alt("d", { "window --toggle float", "window --grid 4:4:1:1:2:2" })
-- alt("w", { "window --close" })

-- special characters
alt("'", { "space --layout stack" })
alt(";", { "space --layout bsp" })
-- alt("tab", { "space --focus recent" })

local homeRow = { h = "west", j = "south", k = "north", l = "east" }

for key, direction in pairs(homeRow) do
	-- move between windows with hjkl
	-- alt(key, { "window --focus " .. direction })
	altShift(key, { "window --swap " .. direction })
end
