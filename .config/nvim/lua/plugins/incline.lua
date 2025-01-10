local icons = {
	diagnostics = {
		Error = " ",
		Warn = " ",
		Hint = " ",
		Info = " ",
	},
	git = {
		added = "",
		changed = "",
		deleted = "",
	},
}

local hi_groups = {
	changed = "DiagnosticInfo",
	deleted = "DiagnosticVirtualTextError",
	added = "DiagnosticOk",
}

local function get_diagnostic_label(props)
	local label = {}

	for severity, icon in pairs(icons.diagnostics) do
		local n = #vim.diagnostic.get(props.buf, { severity = vim.diagnostic.severity[string.upper(severity)] })
		if n > 0 then
			table.insert(label, { icon .. "" .. n .. " ", group = "DiagnosticSign" .. severity })
		end
	end
	return label
end

local function get_git_diff(props)
	local labels = {}
	local success, signs = pcall(vim.api.nvim_buf_get_var, props.buf, "gitsigns_status_dict")

	if success then
		for name, icon in pairs(icons.git) do
			if tonumber(signs[name]) and signs[name] > 0 then
				table.insert(labels, { icon .. " " .. signs[name] .. " ", group = hi_groups[name] })
			end
		end
		return labels
	else
		for name, icon in pairs(icons.git) do
			if tonumber(signs[name]) and signs[name] > 0 then
				table.insert(labels, { icon .. " " .. signs[name] .. " ", group = hi_groups[name] })
			end
		end
		return labels
	end
end

local function starts_with(str, start)
	return string.sub(str, 1, #start) == start
end

return {
	"b0o/incline.nvim",
	event = "VeryLazy",
	config = function()
		-- local colors = require("catppuccin.palettes").get_palette("mocha")
		-- local colors = require("poimandres.palette")
		-- local colors = require("vesper.colors")

		require("incline").setup({
			highlight = {
				groups = {
					-- InclineNormal = { guibg = "00FFFFFF", guifg = colors.pink1 },
					-- InclineNormal = { guibg = "00FFFFFF", guifg = colors.orange },
					-- transparent "00FFFFFF"
					-- InclineNormalNC = { guibg = "00FFFFFF", guifg = colors.background1 },
				},
			},
			hide = {
				cursorline = true,
				focused_win = false,
				only_win = false,
			},
			window = {
				margin = {
					horizontal = 1,
					vertical = 0,
				},
				placement = {
					horizontal = "right",
					vertical = "top",
				},
			},
			render = function(props)
				--
				-- local filename = vim.fn.fnamemodify(bufname, ":t")
				-- local path = vim.fn.fnamemodify(bufname, ":p:.")
				--
				-- if starts_with(bufname, "oil://") then
				-- 	path = "oil"
				-- elseif vim.bo[props.buf].modified then
				-- 	path = "[+] " .. path
				-- end
				--
				-- local icon, color = require("nvim-web-devicons").get_icon_color(filename)
				-- return { { icon, guifg = color }, { " " }, { path } }
				local bufname = vim.api.nvim_buf_get_name(props.buf)
				local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(props.buf), ":p")
				local ft_icon, ft_color = require("nvim-web-devicons").get_icon_color(filename)
				local modified = vim.api.nvim_get_option_value("modified", { buf = props.bufnr }) and "bold,italic"
					or "normal"

				local path = vim.fn.fnamemodify(bufname, ":p:.")

				if starts_with(bufname, "oil://") then
					path = "oil"
				end

				local buffer = {
					{ get_git_diff(props) },
					{ get_diagnostic_label(props) },
					{ ft_icon, guifg = ft_color },
					{ " " },
					{ path, gui = modified },
				}
				return buffer
			end,
		})
	end,
}
