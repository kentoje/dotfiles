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

local function project_uses_tsgo()
	-- Use tsgo when the repo has adopted the TS7 native compiler as its
	-- type-checker. Signal: the nearest package.json runs `tsgo` in a script
	-- (e.g. "ts:check": "tsgo --noEmit"). In package.json the string "tsgo"
	-- only ever appears in a script command, never in a dependency name
	-- (the binary ships as @typescript/native-preview), so a plain-text
	-- match is reliable.
	local pkg = vim.fn.findfile("package.json", vim.fn.getcwd() .. ";")
	if pkg == "" then
		return false
	end
	local file = io.open(vim.fn.fnamemodify(pkg, ":p"), "r")
	if not file then
		return false
	end
	local content = file:read("*all")
	file:close()
	return content:find("tsgo", 1, true) ~= nil
end

local function tsgo_cmd()
	-- Prefer the project's pinned tsgo (matches CI exactly); fall back to
	-- the Mason/PATH build when the repo has no local install.
	local local_bin = vim.fn.getcwd() .. "/node_modules/.bin/tsgo"
	local bin = (vim.fn.executable(local_bin) == 1) and local_bin or "tsgo"
	return { bin, "--lsp", "--stdio" }
end

local function setup_tsgo(lsp_capabilities, custom_typescript_config)
	-- tsgo: Fast TypeScript compiler with LSP support
	-- Handles: diagnostics, hover, definition, references, formatting, completion, and all other LSP features

	-- Configure tsgo using new vim.lsp.config API
	vim.lsp.config.tsgo = {
		cmd = tsgo_cmd(),
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
		},
	}

	vim.lsp.enable("tsgo")
end

local function setup_vtsls(lsp_capabilities, custom_typescript_config)
	-- vtsls: Full-featured TypeScript LSP server
	-- Handles: diagnostics, hover, definition, references, formatting, completion, code actions, and all other LSP features

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

	vim.lsp.enable("vtsls")
end

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
				vim.keymap.set("n", "gd", vim.diagnostic.open_float, opts) -- open error
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

		-- Per-project TS language server:
		--   tsgo  -> repo adopted TS7 native (editor == CI compiler, native speed)
		--   vtsls -> everything else (richer: organize-imports, refactors, ts plugins)
		-- Only one attaches; the other is disabled via empty filetypes.
		if project_uses_tsgo() then
			setup_tsgo(lsp_capabilities, custom_typescript_config)
			vim.lsp.config.vtsls = { filetypes = {} }
		else
			setup_vtsls(lsp_capabilities, custom_typescript_config)
			vim.lsp.config.tsgo = { filetypes = {} }
		end

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

		vim.keymap.set("n", "gh", vim.lsp.buf.hover, { silent = true, desc = "Hover documentation" })
		vim.keymap.set("n", "<leader>r", ":LspR<CR>", { silent = true, desc = "Restart LSP" })

		vim.keymap.set("n", "<leader>E", function()
			if not project_uses_tsgo() then
				vim.cmd("VtsExec add_missing_imports")
				vim.cmd("VtsExec remove_unused_imports")
			else
				-- tsgo doesn't support organize imports yet
				print("Organize imports not supported in tsgo")
			end
		end, { desc = "Organize imports (vtsls only)" })

		if config_exists(biome_config_names) then
			vim.keymap.set("n", "<leader>e", function()
				local current_path = vim.fn.expand("%:p")

				vim.cmd(":%! biome check --write --unsafe --stdin-file-path=" .. current_path)
			end, { silent = true, desc = "Biome fix all mimic" })
		elseif config_exists(prettier_config_names) then
			vim.keymap.set("n", "<leader>e", function()
				vim.cmd("LspEslintFixAll")
				-- local current_path = vim.fn.expand("%:p")
				-- vim.cmd(":%! prettier --write " .. current_path)
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
