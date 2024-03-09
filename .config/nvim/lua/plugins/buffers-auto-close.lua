return {
	"pierregoutheraud/buffers-auto-close.nvim",
	config = function()
		require("buffers-auto-close").setup({
			max_buffers = 5,
		})
	end,
}
