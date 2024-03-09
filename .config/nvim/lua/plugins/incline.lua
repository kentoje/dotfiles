return {
	"b0o/incline.nvim",
	dependencies = { "catppuccin/nvim" },
	event = "BufReadPre",
	priority = 1200,
	config = function()
		local colors = require("catppuccin.palettes").get_palette("mocha")

		require("incline").setup({
			highlight = {
				groups = {
					InclineNormal = { guibg = "00FFFFFF", guifg = colors.blue },
					-- transparent "00FFFFFF"
					InclineNormalNC = { guibg = "00FFFFFF", guifg = colors.overlay0 },
				},
			},
			window = { margin = { vertical = 0, horizontal = 1 } },
			hide = {
				cursorline = true,
			},
			render = function(props)
				local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ":t")
				local parent_filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ":p:h:t")

				local constructed_path = parent_filename .. "/" .. filename

				if vim.bo[props.buf].modified then
					constructed_path = "[+] " .. constructed_path
				end

				local icon, color = require("nvim-web-devicons").get_icon_color(filename)
				return { { icon, guifg = color }, { " " }, { constructed_path } }
			end,
		})
	end,
}
