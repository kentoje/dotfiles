if not vim.g.vscode then
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

	require("lualine").setup({
		options = {
			theme = "auto",
			globalstatus = true,
			section_separators = { left = "", right = "" },
			component_separators = { left = "", right = "" },
			disabled_filetypes = { statusline = { "dashboard", "lazy", "alpha" } },
		},
		sections = {
			lualine_a = { "mode" },
			lualine_x = { "encoding", "fileformat", "filetype" },
			lualine_y = { "progress" },
			lualine_b = {{ "filename", path = 1 }},
			lualine_c = { diff, diagnostics },
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
end
