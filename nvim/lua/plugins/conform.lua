local function pick_js_formatter()
	if vim.loop.fs_realpath(".prettierrc") then
		return { "prettierd" }
	end

	return { "eslint_d" }
end

return {
	"stevearc/conform.nvim",
	config = function()
		require("conform").setup({
			formatters_by_ft = {
				-- Examples:
				-- Conform will run multiple formatters sequentially
				-- python = { "isort", "black" },
				-- Use a sub-list to run only the first available formatter
				-- javascript = { { "prettierd", "prettier" } },

				lua = { "stylua" },
				-- javascript = { "prettierd" },
				-- typescript = { "prettierd" },
				-- javascriptreact = { "prettierd" },
				-- typescriptreact = { "prettierd" },

				javascript = pick_js_formatter(),
				typescript = pick_js_formatter(),
				javascriptreact = pick_js_formatter(),
				typescriptreact = pick_js_formatter(),
				html = { "prettierd" },
				css = { "prettierd" },
				markdown = { { "prettierd", "prettier" } },
				yaml = { { "prettierd", "prettier" } },
				graphql = { { "prettierd", "prettier" } },
				json = { "prettierd" },
			},
			format_on_save = {
				-- These options will be passed to conform.format()
				timeout_ms = 500,
				async = false,
				lsp_fallback = true,
			},
		})
	end,
}
