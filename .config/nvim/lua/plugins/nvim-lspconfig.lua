local function file_exists(name)
	local f = io.open(name, "r")
	return f ~= nil and io.close(f)
end

local biome_config_names = { "biome.json" }
local prettier_config_names = {
	".prettierrc",
	".prettierrc.json",
	".prettierrc.yml",
	".prettierrc.yaml",
	".prettierrc.js",
	".prettierrc.cjs",
	"prettier.config.js",
	"prettier.config.cjs",
	"prettier.config.mjs",
}

local function config_exists(config_names)
	for _, name in ipairs(config_names) do
		if vim.loop.fs_stat(name) then
			return true
		end
	end
	return false
end

-- local function is_typescript_version_4()
-- 	local util = require("lspconfig.util")
-- 	local package_json_path = util.root_pattern("package.json")(vim.fn.getcwd())
--
-- 	if not package_json_path then
-- 		return false -- Default to gte5 setup
-- 	end
--
-- 	local file = io.open(package_json_path .. "/package.json", "r")
-- 	if not file then
-- 		return false -- Default to gte5 setup
-- 	end
--
-- 	local content = file:read("*all")
-- 	file:close()
--
-- 	local ok, package_data = pcall(vim.json.decode, content)
-- 	if not ok or not package_data.devDependencies then
-- 		return false -- Default to gte5 setup
-- 	end
--
-- 	local ts_version = package_data.devDependencies.typescript
-- 	if ts_version and ts_version:match("^[~^]?4%.") then
-- 		return true -- TypeScript 4.x found
-- 	end
--
-- 	return false -- Default to gte5 setup for all other cases
-- end

local function setup_typescript(lsp_capabilities, custom_typescript_config)
	-- vtsls: Full-featured TypeScript LSP server
	-- Handles: completion, code actions, refactoring, imports, rename, call hierarchy, code lens,
	--          document highlight, folding, inlay hints, semantic tokens, workspace operations,
	--          hover, definition, references, formatting, diagnostics (everything enabled)

	-- Configure vtsls using new vim.lsp.config API
	vim.lsp.config.vtsls = {
		cmd = { "vtsls", "--stdio" },
		filetypes = {
			"javascript",
			"javascriptreact",
			"javascript.jsx",
			"typescript",
			"typescriptreact",
			"typescript.tsx",
		},
		root_markers = { "tsconfig.json", "jsconfig.json", "package.json", ".git" },
		capabilities = lsp_capabilities,
		settings = {
			typescript = custom_typescript_config,
			javascript = {
				updateImportsOnFileMove = "always",
			},
			vtsls = {
				enableMoveToFileCodeAction = true,
				autoUseWorkspaceTsdk = true,
			},
		},
	}
end

-- tsgo does is not usable as of now... I had some issues with my local tsconfig, like aliases not working.
-- local function setup_typescript_gte5(lsp_capabilities, custom_typescript_config)
-- 	local util = require("lspconfig.util")
-- 	local tsgo_cmd = { "tsgo", "--lsp", "--stdio" }
--
-- 	-- tsgo: Fast TypeScript compiler with LSP support
-- 	-- Handles: diagnostics, hover, definition, references, formatting
-- 	local tsgo_config = {
-- 		default_config = {
-- 			cmd = tsgo_cmd,
-- 			root_markers = {
-- 				"tsconfig.json",
-- 				"jsconfig.json",
-- 				"package.json",
-- 				".git",
-- 				"tsconfig.base.json",
-- 			},
-- 			filetypes = {
-- 				"javascript",
-- 				"javascriptreact",
-- 				"javascript.jsx",
-- 				"typescript",
-- 				"typescriptreact",
-- 				"typescript.tsx",
-- 			},
-- 			root_dir = function(fname)
-- 				return util.root_pattern("tsconfig.json", "jsconfig.json")(fname)
-- 					or util.root_pattern("package.json", ".git")(fname)
-- 			end,
-- 			single_file_support = true,
-- 			settings = {
-- 				typescript = custom_typescript_config,
-- 				javascript = {
-- 					updateImportsOnFileMove = "always",
-- 				},
-- 			},
-- 		},
-- 	}
--
-- 	require("lspconfig.configs").tsgo = tsgo_config
-- 	require("lspconfig").tsgo.setup({
-- 		capabilities = lsp_capabilities,
-- 		on_attach = function(client)
-- 			print("tsgo capabilities:", vim.inspect(client.server_capabilities))
-- 			-- does not fully work yet
-- 			client.server_capabilities.completionProvider = false
-- 		end,
-- 	})
--
-- 	-- vtsls: Full-featured TypeScript LSP server
-- 	-- Handles: completion, code actions, refactoring, imports, rename, call hierarchy, code lens,
-- 	--          document highlight, folding, inlay hints, semantic tokens, workspace operations
-- 	-- Disabled: hover, definition, references, formatting, etc. (handled by tsgo)
-- 	local vtsls_config = {
-- 		default_config = {
-- 			cmd = { "vtsls", "--stdio" },
-- 			filetypes = {
-- 				"javascript",
-- 				"javascriptreact",
-- 				"javascript.jsx",
-- 				"typescript",
-- 				"typescriptreact",
-- 				"typescript.tsx",
-- 			},
-- 			root_dir = function(fname)
-- 				return util.root_pattern("tsconfig.json", "jsconfig.json")(fname)
-- 					or util.root_pattern("package.json", ".git")(fname)
-- 			end,
-- 			single_file_support = true,
-- 			settings = {
-- 				typescript = custom_typescript_config,
-- 				javascript = {
-- 					updateImportsOnFileMove = "always",
-- 				},
-- 				vtsls = {
-- 					enableMoveToFileCodeAction = true,
-- 					autoUseWorkspaceTsdk = true,
-- 				},
-- 			},
-- 		},
-- 	}
--
-- 	require("lspconfig.configs").vtsls = vtsls_config
-- 	require("lspconfig").vtsls.setup({
-- 		capabilities = lsp_capabilities,
-- 		handlers = {
-- 			["textDocument/publishDiagnostics"] = function() end,
-- 		},
-- 		on_attach = function(client, bufnr)
-- 			-- Disable capabilities already handled by tsgo
-- 			client.server_capabilities.hoverProvider = false
-- 			client.server_capabilities.definitionProvider = false
-- 			client.server_capabilities.referencesProvider = false
-- 			client.server_capabilities.implementationProvider = false
-- 			client.server_capabilities.typeDefinitionProvider = false
-- 			client.server_capabilities.documentFormattingProvider = false
-- 			client.server_capabilities.documentRangeFormattingProvider = false
-- 			client.server_capabilities.documentOnTypeFormattingProvider = false
-- 			client.server_capabilities.documentSymbolProvider = false
-- 			client.server_capabilities.workspaceSymbolProvider = false
-- 			client.server_capabilities.signatureHelpProvider = false
--
-- 			-- Keep vtsls-specific capabilities enabled:
-- 			-- codeActionProvider, codeLensProvider, renameProvider, executeCommandProvider,
-- 			-- callHierarchyProvider, documentHighlightProvider, foldingRangeProvider,
-- 			-- inlayHintProvider, linkedEditingRangeProvider, selectionRangeProvider,
-- 			-- semanticTokensProvider, workspace.fileOperations
-- 		end,
-- 	})
-- end

return {
	"neovim/nvim-lspconfig",
	dependencies = {
		{
			"williamboman/mason.nvim",
			version = "v2.*",
			build = function()
				pcall(vim.cmd, "MasonUpdate")
			end,
		},
		{ "williamboman/mason-lspconfig.nvim", version = "v2.*" },
		{ "L3MON4D3/LuaSnip", version = "v2.*" },
		{ "yioneko/nvim-vtsls" },
	},
	config = function()
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

		-- lspconfig.sourcekit.setup({
		-- 	capabilities = {
		-- 		workspace = {
		-- 			didChangeWatchedFiles = {
		-- 				dynamicRegistration = true,
		-- 			},
		-- 		},
		-- 	},
		-- })

		-- local lsp_capabilities = require("cmp_nvim_lsp").default_capabilities()
		local lsp_capabilities = require("blink.cmp").get_lsp_capabilities()

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
					signs = {
						text = {
							[vim.diagnostic.severity.ERROR] = "",
							[vim.diagnostic.severity.WARN] = "",
							[vim.diagnostic.severity.INFO] = "",
							[vim.diagnostic.severity.HINT] = "",
						},
					},
				})

				vim.keymap.set("n", "gf", function()
					vim.lsp.buf.definition()
				end, opts)
				vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, opts) -- open error
				vim.keymap.set("n", "]d", next_diag_repeat, opts) -- go to next diagnostic
				vim.keymap.set("n", "[d", prev_diag_repeat, opts) -- go to prev diagnostic
				vim.keymap.set("n", "]e", next_error_repeat, opts)
				vim.keymap.set("n", "[e", prev_error_repeat, opts)
				vim.keymap.set("n", "]w", next_warning_repeat, opts)
				vim.keymap.set("n", "[w", prev_warning_repeat, opts)
			end,
		})

		local default_setup = function(server)
			-- Skip ts_ls to use custom vtsls setup
			if server == "ts_ls" then
				return
			end

			-- Skip yamlls to use manual setup
			if server == "yamlls" then
				return
			end

			-- Configure server using new vim.lsp.config API
			vim.lsp.config[server] = {
				capabilities = lsp_capabilities,
			}

			-- Enable the server
			vim.lsp.enable(server)
		end

		local custom_typescript_config = {
			updateImportsOnFileMove = "always",
		}

		if file_exists(".yarn/sdks/typescript/lib") then
			custom_typescript_config.tsdk = ".yarn/sdks/typescript/lib"
		elseif file_exists("node_modules/typescript/lib") then
			custom_typescript_config.tsdk = "node_modules/typescript/lib"
		end

		-- Setup TypeScript LSP based on version
		-- if is_typescript_version_4() then

		setup_typescript(lsp_capabilities, custom_typescript_config)

		-- else
		-- 	setup_typescript_gte5(lsp_capabilities, custom_typescript_config)
		-- end

		require("mason").setup({})
		require("mason-lspconfig").setup({
			ensure_installed = { "yamlls" },
			handlers = {
				default_setup,

				eslint = function()
					vim.lsp.config.eslint = {
						capabilities = lsp_capabilities,
						flags = {
							debounce_text_changes = 300,
						},
						-- settings = {
						-- 	packageManager = "yarn",
						-- },
					}
					vim.lsp.enable("eslint")
				end,

				graphql = function()
					vim.lsp.config.graphql = {
						capabilities = lsp_capabilities,
						filetypes = { "graphql", "typescriptreact", "javascriptreact", "typescript" },
						root_markers = { ".git" },
					}
					vim.lsp.enable("graphql")
				end,
			},
		})

		-- Enable LSP servers using new vim.lsp.enable API
		vim.lsp.enable("vtsls")

		-- Manual yamlls setup using vim.lsp.config API
		vim.lsp.config.yamlls = {
			capabilities = lsp_capabilities,
			settings = {
				yaml = {
					customTags = { "!reference sequence" },
					schemas = {
						["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
						["https://gitlab.com/gitlab-org/gitlab/-/raw/master/app/assets/javascripts/editor/schema/ci.json"] = {
							".gitlab-ci.yml",
							"**/.gitlab-ci.yml",
							"**/.gitlab/**/*.yml",
							"**/.gitlab/**/*.yaml",
							"**/*gitlab-ci*.yml",
							"**/*gitlab-ci*.yaml",
						},
					},
				},
			},
		}
		vim.lsp.enable("yamlls")

		vim.keymap.set("n", "gd", vim.lsp.buf.hover, { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>r", ":LspR<CR>", { silent = true, desc = "Restart LSP" })

		vim.keymap.set("n", "<leader>E", function()
			vim.cmd("VtsExec add_missing_imports")
			vim.cmd("VtsExec remove_unused_imports")
		end, { desc = "Magic import fix" })

		if config_exists(biome_config_names) then
			vim.keymap.set("n", "<leader>e", function()
				local current_path = vim.fn.expand("%:p")

				vim.cmd(":%! biome check --write --unsafe --stdin-file-path=" .. current_path)
			end, { silent = true, desc = "Biome fix all mimic" })
		elseif config_exists(prettier_config_names) then
			vim.keymap.set("n", "<leader>e", function()
				vim.cmd("LspEslintFixAll")
				local current_path = vim.fn.expand("%:p")
				vim.cmd(":%! prettier --write " .. current_path)
			end, { silent = true, desc = "ESLint + Prettier format" })
		end

		-- issue with Tab teleporting
		vim.api.nvim_create_autocmd("ModeChanged", {
			pattern = "*",
			callback = function()
				if
					((vim.v.event.old_mode == "s" and vim.v.event.new_mode == "n") or vim.v.event.old_mode == "i")
					and require("luasnip").session.current_nodes[vim.api.nvim_get_current_buf()]
					and not require("luasnip").session.jump_active
				then
					require("luasnip").unlink_current()
				end
			end,
		})

		require("kentoje.snippets")
	end,
}
