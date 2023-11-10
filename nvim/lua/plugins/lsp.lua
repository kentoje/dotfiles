return {
	"neovim/nvim-lspconfig",
	dependencies = {
		{
			"williamboman/mason.nvim",
			build = function()
				pcall(vim.cmd, "MasonUpdate")
			end,
		},
		{ "williamboman/mason-lspconfig.nvim" },
		{ "hrsh7th/nvim-cmp" },
		{ "hrsh7th/cmp-nvim-lsp" },
		{ "L3MON4D3/LuaSnip" },
		{ "rafamadriz/friendly-snippets" },
		{ "saadparwaiz1/cmp_luasnip" },
	},
	config = function()
		vim.fn.sign_define("DiagnosticSignError", { text = "", texthl = "LspDiagnosticsDefaultError" })
		vim.fn.sign_define("DiagnosticSignWarn", { text = "", texthl = "LspDiagnosticsDefaultWarning" })
		vim.fn.sign_define("DiagnosticSignInfo", { text = "", texthl = "LspDiagnosticsDefaultInformation" })
		vim.fn.sign_define("DiagnosticSignHint", { text = "", texthl = "LspDiagnosticsDefaultHint" })

		local lspconfig = require("lspconfig")
		local lsp_capabilities = require("cmp_nvim_lsp").default_capabilities()

		vim.api.nvim_create_autocmd("LspAttach", {
			desc = "LSP actions",
			callback = function(event)
				local opts = { buffer = event.buf }

				-- vim.keymap.set("n", "<leader>g", function()
				-- 	vim.lsp.buf.definition()
				-- end, opts)
				-- vim.keymap.set("n", "<leader>G", function()
				-- 	vim.lsp.buf.references()
				-- end, opts)
				-- vim.keymap.set("n", "<leader>fs", function()
				-- 	vim.lsp.buf.workspace_symbol()
				-- end, opts)
				-- vim.keymap.set("n", "<leader>.", function()
				-- 	vim.lsp.buf.code_action()
				-- end, opts)
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
				vim.keymap.set("n", "<leader>h", function()
					vim.lsp.buf.hover()
				end, opts)
				-- vim.keymap.set("n", "<leader><F2>", function()
				-- 	vim.lsp.buf.rename()
				-- end, opts)
				vim.keymap.set("n", "<leader>j", vim.diagnostic.open_float, opts) -- open error
				vim.keymap.set("n", "<leader>e", vim.diagnostic.goto_next, opts) -- go to next error
				vim.keymap.set("n", "<leader>E", vim.diagnostic.goto_prev, opts) -- go to next error
			end,
		})

		local default_setup = function(server)
			lspconfig[server].setup({
				capabilities = lsp_capabilities,
			})
		end

		require("mason").setup({})
		require("mason-lspconfig").setup({
			ensure_installed = {},
			handlers = {
				default_setup,

				yamlls = function()
					lspconfig.yamlls.setup({
						settings = {
							yaml = {
								schemas = {
									["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
								},
							},
						},
					})
				end,

				eslint = function()
					lspconfig.eslint.setup({
						capabilities = lsp_capabilities,
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
				end,
			},
		})

		local cmp = require("cmp")

		require("luasnip.loaders.from_vscode").lazy_load()

		cmp.setup({
			sources = {
				{ name = "nvim_lsp" },
				{ name = "luasnip" },
			},
			mapping = cmp.mapping.preset.insert({
				["<C-b>"] = cmp.mapping.scroll_docs(-2),
				["<C-f>"] = cmp.mapping.scroll_docs(2),
				["<C-Space>"] = cmp.mapping.complete(),
				["<CR>"] = cmp.mapping.confirm({ select = true }), -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
			}),
			snippet = {
				expand = function(args)
					require("luasnip").lsp_expand(args.body)
				end,
			},
		})
	end,
}
