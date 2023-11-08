if vim.g.vscode then
	-- VSCode extension
	require("kentoje.remap-vscode")
else
	-- ordinary Neovim
	require("kentoje.set")
	require("kentoje.remap")
	require("kentoje.lazy")
end

local has = function(x)
	return vim.fn.has(x) == 1
end

local is_mac = has("macunix")

if is_mac then
	require("macos")
end
