return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	config = function()
		require("nvim-treesitter.configs").setup({
			-- autotag = {
			-- 	enable = true,
			-- 	enable_rename = true,
			-- 	enable_close = true,
			-- 	enable_close_on_slash = true,
			-- filetypes = {
			-- 	"html",
			-- 	"javascript",
			-- 	"typescript",
			-- 	"javascriptreact",
			-- 	"typescriptreact",
			-- 	"tsx",
			-- 	"jsx",
			-- },
			-- },
			-- A list of parser names, or "all" (the five listed parsers should always be installed)
			incremental_selection = {
				enable = true,
				keymaps = {
					init_selection = "<C-space>",
					node_incremental = "<C-space>",
					scope_incremental = false,
					node_decremental = "<bs>",
				},
			},
			ensure_installed = {
				"c",
				"rust",
				"lua",
				"vim",
				"vimdoc",
				"query",
				"javascript",
				"typescript",
				"tsx",
				"yaml",
				"gitignore",
				"graphql",
				"markdown",
				"markdown_inline",
				"fish",
			},

			-- Install parsers synchronously (only applied to `ensure_installed`)
			sync_install = false,

			-- Automatically install missing parsers when entering buffer
			-- Recommendation: set to false if you don't have `tree-sitter` CLI installed locally
			auto_install = true,

			---- If you need to change the installation directory of the parsers (see -> Advanced Setup)
			-- parser_install_dir = "/some/path/to/store/parsers", -- Remember to run vim.opt.runtimepath:append("/some/path/to/store/parsers")!

			highlight = {
				enable = true,

				-- Setting this to true will run `:h syntax` and tree-sitter at the same time.
				-- Set this to `true` if you depend on 'syntax' being enabled (like for indentation).
				-- Using this option may slow down your editor, and you may see some duplicate highlights.
				-- Instead of true it can also be a list of languages
				additional_vim_regex_highlighting = false,
			},
		})

		-- MDX
		vim.filetype.add({
			extension = {
				mdx = "mdx",
			},
		})
		vim.treesitter.language.register("markdown", "mdx")
	end,
}
