if not vim.g.vscode then
	-- TODO: Customise it later.
	local config = require('alpha.themes.dashboard').config

	require('alpha').setup(config)
end
