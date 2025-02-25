return {
	"VidocqH/lsp-lens.nvim",
	enabled = false,
	config = function()
		require("lsp-lens").setup({
			enable = true,
			include_declaration = false, -- Reference include declaration
			sections = { -- Enable / Disable specific request, formatter example looks 'Format Requests'
				definition = false,
				references = true,
				implements = false,
				git_authors = false,
			},
			ignore_filetype = {
				"prisma",
				"graphql",
			},
			-- Target Symbol Kinds to show lens information
			-- target_symbol_kinds = { SymbolKind.Function, SymbolKind.Method, SymbolKind.Interface },
			-- Symbol Kinds that may have target symbol kinds as children
			-- wrapper_symbol_kinds = { SymbolKind.Class, SymbolKind.Struct },
		})
	end,
}
