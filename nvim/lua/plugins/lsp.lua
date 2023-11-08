return {
	"VonHeikemen/lsp-zero.nvim",
	branch = "v2.x",
	dependencies = {
		-- LSP Support
		{ "neovim/nvim-lspconfig" }, -- Required
		{ -- Optional
			"williamboman/mason.nvim",
			build = function()
				pcall(vim.cmd, "MasonUpdate")
			end,
		},
		{ "williamboman/mason-lspconfig.nvim" }, -- Optional

		-- Autocompletion
		{ "hrsh7th/nvim-cmp" }, -- Required
		{ "hrsh7th/cmp-nvim-lsp" }, -- Required
		{ "L3MON4D3/LuaSnip" }, -- Required
	},
	config = function()
		vim.fn.sign_define("DiagnosticSignError", { text = "", texthl = "LspDiagnosticsDefaultError" })
		vim.fn.sign_define("DiagnosticSignWarn", { text = "", texthl = "LspDiagnosticsDefaultWarning" })
		vim.fn.sign_define("DiagnosticSignInfo", { text = "", texthl = "LspDiagnosticsDefaultInformation" })
		vim.fn.sign_define("DiagnosticSignHint", { text = "", texthl = "LspDiagnosticsDefaultHint" })

		-- move it elsewhere?
		require("luasnip.loaders.from_vscode").lazy_load()

		-- local neodev = require("neodev")
		-- neodev.setup({
		-- 	library = {
		-- 		enabled = true, -- when not enabled, neodev will not change any settings to the LSP server
		-- 		-- these settings will be used for your Neovim config directory
		-- 		runtime = true, -- runtime path
		-- 		types = true, -- full signature, docs and completion of vim.api, vim.treesitter, vim.lsp and others
		-- 		plugins = { "neotest" }, -- installed opt or start plugins in packpath
		-- 		-- you can also specify the list of plugins to make available as a workspace library
		-- 		-- plugins = { "nvim-treesitter", "plenary.nvim", "telescope.nvim" },
		-- 	},
		-- 	setup_jsonls = true, -- configures jsonls to provide completion for project specific .luarc.json files
		-- 	-- for your Neovim config directory, the config.library settings will be used as is
		-- 	-- for plugin directories (root_dirs having a /lua directory), config.library.plugins will be disabled
		-- 	-- for any other directory, config.library.enabled will be set to false
		-- 	override = function(root_dir, options) end,
		-- 	-- With lspconfig, Neodev will automatically setup your lua-language-server
		-- 	-- If you disable this, then you have to set {before_init=require("neodev.lsp").before_init}
		-- 	-- in your lsp start options
		-- 	lspconfig = true,
		-- 	-- much faster, but needs a recent built of lua-language-server
		-- 	-- needs lua-language-server >= 3.6.0
		-- 	pathStrict = true,
		-- })

		local capabilities = require("cmp_nvim_lsp").default_capabilities()

		local lsp = require("lsp-zero").preset({})
		local lspconfig = require("lspconfig")
		local ts_utils = require("nvim-treesitter.ts_utils")

		local cmp = require("cmp")
		cmp.setup({
			mapping = cmp.mapping.preset.insert({
				["<C-b>"] = cmp.mapping.scroll_docs(-2),
				["<C-f>"] = cmp.mapping.scroll_docs(2),
				["<C-Space>"] = cmp.mapping.complete(),
				["<CR>"] = cmp.mapping.confirm({ select = true }), -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
			}),
			-- performance = {
			-- max_view_entries = 30,
			-- },
			-- completion = {
			-- 	keyword_length = 6,
			-- },
			-- sources = cmp.config.sources({
			-- 	{ name = "luasnip" },
			-- 	{
			-- 		name = "nvim_lsp",
			-- 		entry_filter = function(entry, context)
			-- 			local kind = entry:get_kind()
			-- 			local node = ts_utils.get_node_at_cursor():type()
			--
			-- 			if node == "arguments" then
			-- 				-- 6 means variables
			-- 				if kind == 6 then
			-- 					return true
			-- 				else
			-- 					return false
			-- 				end
			-- 			end
			--
			-- 			return true
			-- 		end,
			-- 	},
			-- }),
			-- PreselectMode = cmp.PreselectMode.Item,
			-- limit suggestions items. Triggers auto suggestions at 6 chars.
			-- sources = {
			-- 	{ name = "nvim_lsp", max_items = 30, keyword_length = 6, group_index = 1 },
			-- },
			-- performance = {
			-- 	-- debounce = 1000,
			-- 	throttle = 3000,
			-- 	fetching_timeout = 80,
			-- 	max_view_entries = 30,
			-- },
		})

		lsp.on_attach(function(client, bufnr)
			-- lsp.default_keymaps({ buffer = bufnr })
			local opts = { buffer = bufnr, remap = false }

			-- vim.keymap.set("n", "<leader>g", function()
			-- 	vim.lsp.buf.definition()
			-- end, opts)
			-- vim.keymap.set("n", "<leader>G", function()
			-- 	vim.lsp.buf.references()
			-- end, opts)
			-- vim.keymap.set("n", "<leader>fs", function()
			-- 	vim.lsp.buf.workspace_symbol()
			-- end, opts)
			vim.keymap.set("n", "<leader>h", function()
				vim.lsp.buf.hover()
			end, opts)
			-- vim.keymap.set("n", "<leader>.", function()
			-- 	vim.lsp.buf.code_action()
			-- end, opts)
			vim.keymap.set("n", "<leader><F2>", function()
				vim.lsp.buf.rename()
			end, opts)
			vim.keymap.set("n", "<leader>j", vim.diagnostic.open_float, opts) -- open error
			vim.keymap.set("n", "<leader>e", vim.diagnostic.goto_next, opts) -- go to next error
			vim.keymap.set("n", "<leader>E", vim.diagnostic.goto_prev, opts) -- go to next error
			-- vim.keymap.set("n", "<leader>e", function()
			-- 	vim.diagnostic.goto_next({
			-- 		severity = vim.diagnostic.severity.ERROR,
			-- 	})
			-- end, opts)
			-- vim.keymap.set("n", "<leader>E", function()
			-- 	vim.diagnostic.goto_prev({
			-- 		severity = vim.diagnostic.severity.ERROR,
			-- 	})
			-- end, opts)
			-- vim.keymap.set("n", "<leader>gf", function()
			-- 	vim.lsp.buf.open_float()
			-- end, opts)
			-- vim.keymap.set("n", "<leader>gn", function()
			-- 	vim.lsp.buf.goto_next()
			-- end, opts)
			-- vim.keymap.set("n", "<leader>gp", function()
			-- 	vim.lsp.buf.goto_prev()
			-- end, opts)
			-- vim.keymap.set('n', '<C-h>', function() vim.lsp.buf.signature_help() end, opts)
		end)

		lspconfig.lua_ls.setup(lsp.nvim_lua_ls())
		-- lspconfig.lua_ls.setup({
		-- 	settings = {
		-- 		Lua = {
		-- 			completion = {
		-- 				callSnippet = "Replace",
		-- 			},
		-- 			workspace = {
		-- 				checkThirdParty = false,
		-- 			},
		-- 		},
		-- 	},
		-- })
		lspconfig.yamlls.setup({
			settings = {
				yaml = {
					schemas = {
						["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
					},
				},
			},
		})
		lspconfig.eslint.setup({
			capabilities = capabilities,
			flags = {
				debounce_text_changes = 300,
			},
			settings = {
				packageManager = "yarn",
			},
			on_attach = function(client, bufnr)
				vim.api.nvim_create_autocmd("BufWritePre", {
					buffer = bufnr,
					command = "EslintFixAll",
				})
			end,
		})

		lsp.setup()
	end,
}
