if not vim.g.vscode then
	-- Utilities for creating configurations
	local util = require("formatter.util")

	local prettierd = function()
		if not vim.loop.fs_realpath(".prettierrc") then
			return nil
		end

		return {
			exe = "prettierd",
			args = { vim.api.nvim_buf_get_name(0) },
			stdin = true,
		}
	end

	-- Provides the Format, FormatWrite, FormatLock, and FormatWriteLock commands
	require("formatter").setup({
		-- Enable or disable logging
		logging = true,
		-- Set the log level
		log_level = vim.log.levels.WARN,
		-- All formatter configurations are opt-in
		filetype = {
			-- Formatter configurations for filetype "lua" go here
			-- and will be executed in order
			lua = {
				-- "formatter.filetypes.lua" defines default configurations for the
				-- "lua" filetype
				require("formatter.filetypes.lua").stylua,

				-- You can also define your own configuration
				function()
					-- Supports conditional formatting
					if util.get_current_buffer_file_name() == "special.lua" then
						return nil
					end

					-- Full specification of configurations is down below and in Vim help
					-- files
					return {
						exe = "stylua",
						args = {
							"--search-parent-directories",
							"--stdin-filepath",
							util.escape_path(util.get_current_buffer_file_path()),
							"--",
							"-",
						},
						stdin = true,
					}
				end,
			},
			javascript = { prettierd },
			javascriptreact = { prettierd },
			typescript = { prettierd },
			typescriptreact = { prettierd },
			html = { prettierd },
			markdown = { prettierd },
			graphql = {
				require("formatter.filetypes.lua").graphql,
			},
			-- Use the special "*" filetype for defining formatter configurations on
			-- any filetype
			["*"] = {
				-- "formatter.filetypes.any" defines default configurations for any
				-- filetype
				-- require("formatter.filetypes.any").remove_trailing_whitespace,
			},
		},
	})

	-- format on save
	local formatGroup = vim.api.nvim_create_augroup("Format", { clear = true })
	vim.api.nvim_create_autocmd("BufWritePost", {
		command = "FormatWrite",
		group = formatGroup,
	})
end
