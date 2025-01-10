vim.g.firenvim_config = {
	globalSettings = { alt = "all" },
	localSettings = {
		[".*"] = {
			cmdline = "neovim",
			content = "text",
			priority = 0,
			selector = "textarea, input",
			-- forces it to be not enabled by default. Use the keybinding on Arc to spawn it in the textarea
			takeover = "never",
		},
	},
}

return {
	"glacambre/firenvim",
	-- trying out svim
	enabled = false,
	-- Lazy load firenvim
	lazy = not vim.g.started_by_firenvim,
	module = false,
	-- Explanation: https://github.com/folke/lazy.nvim/discussions/463#discussioncomment-4819297
	build = ":call firenvim#install(0)",
	-- build = function()
	-- require("lazy").load({ plugins = { "firenvim" }, wait = true })
	-- vim.fn["firenvim#install"](0)
	-- end,
}
