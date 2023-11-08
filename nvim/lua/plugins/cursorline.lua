return {
	"yamatsum/nvim-cursorline",
	config = {
		cursorline = {
			enable = false,
			timeout = 1000,
			number = false,
		},
		cursorword = {
			enable = true,
			min_length = 3,
			hl = { underline = true },
		},
	},
}
