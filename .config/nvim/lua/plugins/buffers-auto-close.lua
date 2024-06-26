return {
	"pierregoutheraud/buffers-auto-close.nvim",
	cond = false,
	config = function()
		require("buffers-auto-close").setup({
			max_buffers = 5,
		})
	end,
}
