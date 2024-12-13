local prettier_config_names = { ".prettierrc", ".prettierrc.json", ".prettierrc.js" }

local biome_config_names = { "biome.json" }

-- Check if a file with prettier_config_names exists in the current directory
local function config_exists(config_names)
	for _, name in ipairs(config_names) do
		if vim.loop.fs_stat(name) then
			-- print("Found config file: " .. name)
			return true
		end
	end
	return false
end

local function pick_js_formatter()
	-- print("Picking JS formatter...")

	-- Check for Prettier config files
	if config_exists(prettier_config_names) then
		-- print("Using Prettier.")
		return { { "prettierd", "prettier" } }
	end

	-- Check for Biome config files
	if config_exists(biome_config_names) then
		-- print("Using Biome.")
		-- return { { "biome-check" } }
		return { { "biome" } }
	end

	-- print("No formatter config files found, using Prettier.")
	return { { "prettierd", "prettier" } }

	-- LSP are loaded conditionnally so it should already work
	-- return { { "biome", "prettierd", "prettier" } }
end

return {
	"stevearc/conform.nvim",
	config = function()
		local conform = require("conform")

		-- conform.formatters.prettier = {
		-- 	prepend_args = { "--cache" },
		-- }

		conform.setup({
			formatters_by_ft = {
				-- Examples:
				-- Conform will run multiple formatters sequentially
				-- python = { "isort", "black" },
				-- Use a sub-list to run only the first available formatter
				-- javascript = { { "prettierd", "prettier" } },

				lua = { "stylua" },
				javascript = pick_js_formatter(),
				typescript = pick_js_formatter(),
				javascriptreact = pick_js_formatter(),
				typescriptreact = pick_js_formatter(),
				json = pick_js_formatter(),
				html = { "prettierd" },
				css = { "prettierd" },
				markdown = { { "prettierd" } },
				yaml = { { "prettierd" } },
				graphql = { { "prettierd" } },
				nix = { "nil" },
			},
			format_on_save = {
				-- These options will be passed to conform.format()
				timeout_ms = 2000,
				async = true,
				lsp_fallback = true,
			},
		})
	end,
}
