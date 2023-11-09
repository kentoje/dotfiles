return {
	"glacambre/firenvim",
	-- Lazy load firenvim
	lazy = not vim.g.started_by_firenvim,
	module = false,
	-- Explanation: https://github.com/folke/lazy.nvim/discussions/463#discussioncomment-4819297
	build = function()
		-- require("lazy").load({ plugins = { "firenvim" }, wait = true })
		vim.fn["firenvim#install"](0)
	end,
}
