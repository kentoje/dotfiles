local icons = {
	diagnostics = {
		Error = " ",
		Warn = " ",
		Hint = " ",
		Info = " ",
	},
	git = {
		added = "",
		changed = "",
		deleted = "",
	},
}

local diagnostics = {
	"diagnostics",
	sources = { "nvim_diagnostic" },
	sections = { "error", "warn", "info", "hint" },
	symbols = {
		error = icons.diagnostics.Error,
		hint = icons.diagnostics.Hint,
		info = icons.diagnostics.Info,
		warn = icons.diagnostics.Warn,
	},
	colored = true,
	update_in_insert = false,
	always_visible = false,
}
local diff = {
	"diff",
	symbols = {
		added = icons.git.added .. " ",
		untracked = icons.git.added .. " ",
		modified = icons.git.changed .. " ",
		removed = icons.git.deleted .. " ",
	},
	colored = true,
	always_visible = false,
}

return {
	"nvim-lualine/lualine.nvim",
	dependencies = { "nvim-tree/nvim-web-devicons", lazy = true },
	config = function()
		local wtf = require("wtf")

		require("lualine").setup({
			options = {
				theme = "auto",
				globalstatus = true,
				section_separators = { left = "", right = "" },
				component_separators = { left = "", right = "" },
				disabled_filetypes = { statusline = { "dashboard", "lazy", "alpha" } },
			},
			sections = {
				lualine_a = {
					"mode",
				},
				lualine_b = {
					{
						"buffers",

						-- 0: Shows buffer name
						-- 1: Shows buffer index
						-- 2: Shows buffer name + buffer index
						-- 3: Shows buffer number
						-- 4: Shows buffer name + buffer number
						mode = 2,

						-- buffers_color = {
						-- 	-- Same values as the general color option can be used here.
						-- 	active = "lualine_{section}_normal", -- Color for active buffer.
						-- 	inactive = "lualine_{section}_inactive", -- Color for inactive buffer.
						-- },

						symbols = {
							modified = " [+]", -- Text to show when the buffer is modified
							alternate_file = "", -- Text to show to identify the alternate file
							directory = "", -- Text to show when the buffer is a directory
						},
					},
				},
				lualine_c = { diff, diagnostics },
				lualine_x = { wtf.get_status, "encoding", "fileformat", "filetype" },
				lualine_y = { "progress" },
				lualine_z = {},
			},
			inactive_sections = {
				lualine_a = {},
				lualine_b = {},
				lualine_c = { "filename" },
				lualine_x = { "location" },
				lualine_y = {},
				lualine_z = {},
			},
		})
	end,
}
