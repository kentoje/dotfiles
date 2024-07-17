local function starts_with(str, start)
	return string.sub(str, 1, #start) == start
end

return {
	"b0o/incline.nvim",
	dependencies = { "catppuccin" },
	event = "VeryLazy",
	config = function()
		-- local colors = require("catppuccin.palettes").get_palette("mocha")
		local colors = require("poimandres.palette")

		require("incline").setup({
			highlight = {
				groups = {
					InclineNormal = { guibg = "00FFFFFF", guifg = colors.pink1 },
					-- transparent "00FFFFFF"
					-- InclineNormalNC = { guibg = "00FFFFFF", guifg = colors.background1 },
				},
			},
			window = { margin = { vertical = 0, horizontal = 1 } },
			hide = {
				cursorline = true,
			},
			render = function(props)
				local bufname = vim.api.nvim_buf_get_name(props.buf)

				local filename = vim.fn.fnamemodify(bufname, ":t")
				local path = vim.fn.fnamemodify(bufname, ":p:.")

				if starts_with(bufname, "oil://") then
					path = "oil"
				elseif vim.bo[props.buf].modified then
					path = "[+] " .. path
				end

				local icon, color = require("nvim-web-devicons").get_icon_color(filename)
				return { { icon, guifg = color }, { " " }, { path } }
			end,
		})
	end,
}
