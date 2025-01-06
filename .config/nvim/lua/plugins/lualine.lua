local function get_harpoon_active_indicator(num)
	return function(harpoon_entry)
		return string.format(" %s %s", num, vim.fn.fnamemodify(harpoon_entry.value, ":t"))
	end
end

local function get_harpoon_inactive_indicator(num)
	return function(harpoon_entry)
		return string.format("%s %s", num, vim.fn.fnamemodify(harpoon_entry.value, ":t"))
	end
end

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
		-- local wtf = require("wtf")
		-- local colors = require("catppuccin.palettes").get_palette("mocha")
		-- local colors = require("poimandres.palette")
		local colors = require("vesper.colors")

		require("lualine").setup({
			options = {
				-- theme = "auto",
				-- theme = "poimandres",
				theme = "vesper",
				globalstatus = true,
				-- ░▒▓
				-- section_separators = { left = "", right = "" },
				section_separators = { left = "", right = "" },
				component_separators = { left = " ", right = "" },
				disabled_filetypes = { statusline = { "dashboard", "lazy", "alpha" } },
			},
			sections = {
				lualine_a = {
					"mode",
				},
				lualine_b = {
					{
						-- "buffers",
						"harpoon2",
						active_indicators = {
							get_harpoon_active_indicator(1),
							get_harpoon_active_indicator(2),
							get_harpoon_active_indicator(3),
							get_harpoon_active_indicator(4),
							get_harpoon_active_indicator(5),
							get_harpoon_active_indicator(6),
							get_harpoon_active_indicator(7),
							get_harpoon_active_indicator(8),
							get_harpoon_active_indicator(9),
							get_harpoon_active_indicator(10),
							get_harpoon_active_indicator(11),
							get_harpoon_active_indicator(12),
							get_harpoon_active_indicator(13),
							get_harpoon_active_indicator(14),
							get_harpoon_active_indicator(15),
						},
						indicators = {
							get_harpoon_inactive_indicator(1),
							get_harpoon_inactive_indicator(2),
							get_harpoon_inactive_indicator(3),
							get_harpoon_inactive_indicator(4),
							get_harpoon_inactive_indicator(5),
							get_harpoon_inactive_indicator(6),
							get_harpoon_inactive_indicator(7),
							get_harpoon_inactive_indicator(8),
							get_harpoon_inactive_indicator(9),
							get_harpoon_inactive_indicator(10),
							get_harpoon_inactive_indicator(11),
							get_harpoon_inactive_indicator(12),
							get_harpoon_inactive_indicator(13),
							get_harpoon_inactive_indicator(14),
							get_harpoon_inactive_indicator(15),
						},

						color = {
							-- fg = colors.blue,
							-- fg = colors.blue1,
							fg = colors.green,
							bg = "",
						},

						buffers_color = {
							-- Same values as the general color option can be used here.
							active = {
								-- fg = colors.blue,
								-- fg = colors.teal1,
							}, -- Color for active buffer.
							inactive = {
								-- fg = colors.overlay0,
							}, -- Color for inactive buffer.
						},

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
				-- lualine_x = { wtf.get_status, "encoding", "fileformat", "filetype" },
				-- lualine_x = { wtf.get_status, "filetype" },
				lualine_x = { "encoding", "fileformat", "filetype" },
				-- lualine_x = { "filename" },
				lualine_y = {
					"progress",
				},
				lualine_z = { "location" },
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
