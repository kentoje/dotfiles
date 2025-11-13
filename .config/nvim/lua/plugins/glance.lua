return {
	"dnlhc/glance.nvim",
	enabled = false,
	config = function()
		local glance = require("glance")
		local actions = glance.actions

		glance.setup({
			detached = true,
			height = 35,
			list = {
				position = "left", -- Position of the list window 'left'|'right'
				width = 0.33, -- 33% width relative to the active window, min 0.1, max 0.5
			},
			mappings = {
				list = {
					["<Esc><Esc>"] = actions.close,
				},
				preview = {
					["<Esc><Esc>"] = actions.close,
				},
			},
			border = {
				enable = true, -- Show window borders. Only horizontal borders allowed
				top_char = "―",
				bottom_char = "―",
			},
		})
	end,

	-- vim.keymap.set("n", "gF", ":Glance references<CR>", { silent = true, desc = "Lookup references" }),
}
