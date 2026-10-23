-- Cmd+o: pick URLs from the focused pane with fzf and open them in the browser.
-- Rex port of ~/.config/herdr/scripts/fzf-url.fish (tmux-fzf-url).

local TERMINAL = "com.superlogical.terminal"
local URL_SCHEMES = { http = true, https = true, ftp = true, file = true, ssh = true, git = true }
local URL_CHARS = "[%w%._~:/%?#@!%$&%*%+,;=%%%-]"
-- Only the screen and the lines just above it: Cmd+o is for a link you can see.
local RECENT_LINE_COUNT = 120

local function lastLines(text, count)
  local lines = {}
  for line in (text .. "\n"):gmatch("(.-)\n") do lines[#lines + 1] = line end
  local first = math.max(1, #lines - count + 1)
  return { unpack(lines, first) }
end

--- Returns the URLs found in `lines`, newest first, without duplicates.
local function extractScreenUrls(lines)
  local found = {}
  for _, line in ipairs(lines) do
    for scheme, rest in line:gmatch("(%a+)://(" .. URL_CHARS .. "+)") do
      if URL_SCHEMES[scheme:lower()] then found[#found + 1] = scheme .. "://" .. rest end
    end
    for rest in line:gmatch("www%.(" .. URL_CHARS .. "+)") do
      found[#found + 1] = "https://www." .. rest
    end
  end
  local urls, seen = {}, {}
  for i = #found, 1, -1 do
    local url = found[i]:gsub("[%.,;:]+$", "")
    if not seen[url] then
      seen[url] = true
      urls[#urls + 1] = url
    end
  end
  return urls
end

rex.action{
  name = "open_screen_url",
  title = "Open URL from Screen…",
  keywords = "url link open browser fzf",
  run = function(ctx)
    local screen, err = rex.block.call(TERMINAL, "format", { block_id = ctx.block_id, unwrap = true, trim = true })
    if screen == nil then error("screen url picker: " .. tostring(err), 0) end

    local urls = extractScreenUrls(lastLines(screen.content, RECENT_LINE_COUNT))
    if #urls == 0 then return end

    local listPath = os.tmpname()
    local file = assert(io.open(listPath, "w"))
    file:write(table.concat(urls, "\n"), "\n")
    file:close()

    openZoomedCommandPane(ctx, { "fish", "--no-config", "scripts/rex-url-picker.fish", listPath })
  end,
}
