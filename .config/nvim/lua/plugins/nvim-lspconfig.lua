local function file_exists(name)
	local f = io.open(name, "r")
	return f ~= nil and io.close(f)
end

local dump = require("kentoje.helpers").dump

local biome_config_names = { "biome.json" }

local function config_exists(config_names)
	for _, name in ipairs(config_names) do
		if vim.loop.fs_stat(name) then
			return true
		end
	end
	return false
end

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
		{ "yioneko/nvim-vtsls" },
		-- { "saghen/blink.cmp" },
		{ "williamboman/mason-lspconfig.nvim" },
		{ "yioneko/nvim-vtsls" },
	},
	config = function()
		vim.fn.sign_define("DiagnosticSignError", { text = "", texthl = "LspDiagnosticsDefaultError" })
		vim.fn.sign_define("DiagnosticSignWarn", { text = "", texthl = "LspDiagnosticsDefaultWarning" })
		vim.fn.sign_define("DiagnosticSignInfo", { text = "", texthl = "LspDiagnosticsDefaultInformation" })
		vim.fn.sign_define("DiagnosticSignHint", { text = "", texthl = "LspDiagnosticsDefaultHint" })

		local move_next_error = function()
			vim.diagnostic.goto_next({
				severity = vim.diagnostic.severity.ERROR,
			})
		end
		local move_prev_error = function()
			vim.diagnostic.goto_prev({
				severity = vim.diagnostic.severity.ERROR,
			})
		end

		local move_next_warning = function()
			vim.diagnostic.goto_next({
				severity = vim.diagnostic.severity.WARN,
			})
		end
		local move_prev_warning = function()
			vim.diagnostic.goto_prev({
				severity = vim.diagnostic.severity.WARN,
			})
		end

		local move_next_diag = function()
			vim.diagnostic.goto_next()
		end
		local move_prev_diag = function()
			vim.diagnostic.goto_prev()
		end

		local lspconfig = require("lspconfig")

		local lsp_capabilities = require("cmp_nvim_lsp").default_capabilities()
		-- local lsp_capabilities = require("blink.cmp").get_lsp_capabilities()

		local ts_repeat_move = require("nvim-treesitter.textobjects.repeatable_move")
		local next_error_repeat, prev_error_repeat =
			ts_repeat_move.make_repeatable_move_pair(move_next_error, move_prev_error)
		local next_diag_repeat, prev_diag_repeat =
			ts_repeat_move.make_repeatable_move_pair(move_next_diag, move_prev_diag)
		local next_warning_repeat, prev_warning_repeat =
			ts_repeat_move.make_repeatable_move_pair(move_next_warning, move_prev_warning)

		vim.api.nvim_create_autocmd("LspAttach", {
			desc = "LSP actions",
			callback = function(event)
				local opts = { buffer = event.buf }

				vim.diagnostic.config({
					severity_sort = true,
					-- tiny-inline-diagnostic
					virtual_text = false,
				})

				vim.keymap.set("n", "gf", function()
					vim.lsp.buf.definition()
				end, opts)
				vim.keymap.set("n", "gD", vim.diagnostic.open_float, opts) -- open error
				vim.keymap.set("n", "]d", next_diag_repeat, opts) -- go to next diagnostic
				vim.keymap.set("n", "[d", prev_diag_repeat, opts) -- go to prev diagnostic
				vim.keymap.set("n", "]e", next_error_repeat, opts)
				vim.keymap.set("n", "[e", prev_error_repeat, opts)
				vim.keymap.set("n", "]w", next_warning_repeat, opts)
				vim.keymap.set("n", "[w", prev_warning_repeat, opts)
			end,
		})

		local default_setup = function(server)
			-- Skip tsserver to use custom tool "https://github.com/pmizio/typescript-tools.nvim"
			if server == "ts_ls" then
				return
			end

			lspconfig[server].setup({
				capabilities = lsp_capabilities,
			})
		end

		-- local vtsls = require("vtsls")
		local util = require("lspconfig.util")
		local cmd = { "vtsls", "--stdio" }

		local custom_typescript_config = {
			updateImportsOnFileMove = "always",
		}

		if file_exists(".yarn/sdks/typescript/lib") then
			custom_typescript_config.tsdk = ".yarn/sdks/typescript/lib"
		end

		local vtsls_config = {
			default_config = {
				cmd = cmd,
				filetypes = {
					"javascript",
					"javascriptreact",
					"javascript.jsx",
					"typescript",
					"typescriptreact",
					"typescript.tsx",
				},
				root_dir = function(fname)
					return util.root_pattern("tsconfig.json", "jsconfig.json")(fname)
						or util.root_pattern("package.json", ".git")(fname)
				end,
				single_file_support = true,
				settings = {
					typescript = custom_typescript_config,
					javascript = {
						updateImportsOnFileMove = "always",
					},
					vtsls = {
						enableMoveToFileCodeAction = true,
						autoUseWorkspaceTsdk = true,
						-- typescript = {
						-- 	tsdk = ".yarn/sdks/typescript/lib",
						-- },
					},
				},
			},
		}

		require("lspconfig.configs").vtsls = vtsls_config
		require("lspconfig").vtsls.setup({
			on_attach = function(client, bufnr)
				require("twoslash-queries").attach(client, bufnr)
			end,
		})

		vim.keymap.set("n", "<leader>E", function()
			vim.cmd("VtsExec add_missing_imports")
			vim.cmd("VtsExec remove_unused_imports")
		end, { desc = "Magic import fix" })

		-- vim.keymap.set("n", "<leader>cf", function()
		-- 	vtsls.rename(vim.fn.input("Current filename: "), vim.fn.input("New filename: "))
		-- end, { desc = "Change file name" })

		require("mason").setup({})
		require("mason-lspconfig").setup({
			ensure_installed = {},
			handlers = {
				default_setup,

				-- tsserver = function()
				-- 	local capabilities =
				-- 		vim.tbl_deep_extend("force", vim.lsp.protocol.make_client_capabilities(), lsp_capabilities)
				--
				-- 	lspconfig.tsserver.setup({
				-- 		capabilities = capabilities,
				-- 	})
				-- end,

				yamlls = function()
					lspconfig.yamlls.setup({
						settings = {
							yaml = {
								customTags = { "!reference sequence" },
								schemas = {
									["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
								},
							},
						},
					})
				end,

				-- nil_ls = function()
				-- 	lspconfig.nil_ls.setup({
				-- 		capabilities = lsp_capabilities,
				-- 		settings = {
				-- 			nil_ls = {
				-- 				formatter = { command = { "nixpkgs-fmt" } },
				-- 			},
				-- 		},
				-- 	})
				-- end,

				eslint = function()
					lspconfig.eslint.setup({
						capabilities = lsp_capabilities,
						flags = {
							debounce_text_changes = 300,
						},
						settings = {
							packageManager = "yarn",
						},
						-- on_attach = function(client, bufnr)
						-- vim.api.nvim_create_autocmd("BufWritePost", {
						-- vim.api.nvim_create_autocmd("BufWritePre", {
						-- 	buffer = bufnr,
						-- 	command = "EslintFixAll",
						-- })
						-- does not work
						-- vim.api.nvim_create_autocmd({ "BufNewFile" }, {
						-- 	buffer = bufnr,
						-- 	command = "LspR",
						-- })
						-- end,
					})
				end,

				graphql = function()
					lspconfig.graphql.setup({
						filetypes = { "graphql", "typescriptreact", "javascriptreact", "typescript" },
						root_dir = function(fname)
							return lspconfig.util.root_pattern(".git")(fname) or lspconfig.util.path.dirname(fname)
						end,
					})
				end,
			},
		})

		vim.keymap.set("n", "gd", vim.lsp.buf.hover, { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>r", ":LspR<CR>", { silent = true, desc = "Restart LSP" })

		-- vim.keymap.set(
		-- 	"i",
		-- 	"<Tab>",
		-- 	"copilot#Accept('<CR>')",
		-- 	{ noremap = true, silent = true, expr = true, replace_keycodes = false }
		-- )

		if config_exists(biome_config_names) then
			vim.keymap.set("n", "<leader>e", function()
				local current_path = vim.fn.expand("%:p")

				vim.cmd(":%! biome check --write --unsafe --stdin-file-path=" .. current_path)
			end, { silent = true, desc = "Biome fix all mimic" })
		else
			vim.keymap.set("n", "<leader>e", function()
				vim.cmd("EslintFixAll")
			end, { silent = true, desc = "EslintFixAll" })
		end

		-- vim.keymap.set("n", "<leader>e", function()
		-- 	local current_path = vim.fn.expand("%:p")
		--
		-- 	vim.cmd(":%! biome check --write --unsafe --stdin-file-path=" .. current_path)
		-- end, { silent = true, desc = "EslintFixAll" })

		local cmp = require("cmp")
		local ls = require("luasnip")

		require("luasnip.loaders.from_vscode").lazy_load()
		require("kentoje.snippets")

		cmp.setup({
			sources = {
				{ name = "nvim_lsp" },
				{ name = "luasnip" },
			},
			mapping = cmp.mapping.preset.insert({
				["<C-b>"] = cmp.mapping.scroll_docs(-2),
				["<C-f>"] = cmp.mapping.scroll_docs(2),
				["<C-Space>"] = cmp.mapping.complete(),
				-- ["<CR>"] = cmp.mapping.confirm({ select = false }), -- Accept currently selected item. Set `select` to `false` to only confirm explicitly selected items.
				["<C-j>"] = cmp.mapping.select_next_item({ behavior = cmp.SelectBehavior.Select }),
				["<C-k>"] = cmp.mapping.select_prev_item({ behavior = cmp.SelectBehavior.Select }),
				["<CR>"] = cmp.mapping(function(fallback)
					if cmp.visible() then
						if ls.expandable() then
							ls.expand()
						else
							cmp.confirm({
								select = true,
							})
						end
					else
						fallback()
					end
				end),
				["<Tab>"] = cmp.mapping(function(fallback)
					if ls.locally_jumpable(1) then
						ls.jump(1)
					else
						fallback()
					end
				end, { "i", "s" }),
				["<S-Tab>"] = cmp.mapping(function(fallback)
					if ls.locally_jumpable(-1) then
						ls.jump(-1)
					else
						fallback()
					end
				end, { "i", "s" }),
			}),
			snippet = {
				expand = function(args)
					require("luasnip").lsp_expand(args.body)
				end,
			},
		})
	end,
}
