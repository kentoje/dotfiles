local prettier_config_names = { ".prettierrc", ".prettierrc.json", ".prettierrc.js" }

local function pick_js_formatter()
	return { "prettierd" }
	-- return { "eslint_d", "prettierd" }
	-- for _, filename in ipairs(prettier_config_names) do
	-- 	if vim.loop.fs_realpath(filename) then
	-- 		return { { "prettier" } }
	-- 	end
	-- end
	--
	-- if vim.loop.fs_realpath(".eslintrc") then
	-- 	return { "eslint" }
	-- end
	--
	-- return { { "prettier" } }
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
