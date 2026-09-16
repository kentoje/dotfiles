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

local ts_filetypes = {
	"javascript",
	"javascriptreact",
	"javascript.jsx",
	"typescript",
	"typescriptreact",
	"typescript.tsx",
}

local ts_root_markers = { "tsconfig.json", "jsconfig.json", "package.json", ".git" }

local function read_json(path)
	local file = io.open(path, "r")
	if file == nil then
		return nil
	end
	local content = file:read("*all")
	file:close()
	local ok, decoded = pcall(vim.json.decode, content)
	if not ok or type(decoded) ~= "table" then
		return nil
	end
	return decoded
end

local function package_uses_tsgo(package)
	if type(package.scripts) ~= "table" then
		return false
	end
	for _, script in pairs(package.scripts) do
		if type(script) == "string" and script:find("tsgo", 1, true) ~= nil then
			return true
		end
	end
	return false
end

local function project_uses_tsgo(start_path)
	local package_path = vim.fs.find("package.json", {
		upward = true,
		path = start_path,
	})[1]
	if package_path == nil then
		return false
	end
	local package = read_json(package_path)
	return package ~= nil and package_uses_tsgo(package)
end

local function buffer_start_path(bufnr)
	local name = vim.api.nvim_buf_get_name(bufnr)
	if name ~= "" then
		return name
	end
	return vim.uv.cwd()
end

local function buffer_project_root(bufnr)
	return vim.fs.root(buffer_start_path(bufnr), ts_root_markers) or vim.uv.cwd()
end

local function buffer_uses_tsgo(bufnr)
	return project_uses_tsgo(buffer_project_root(bufnr))
end

local function tsgo_cmd_for(root)
	local local_bin = root .. "/node_modules/.bin/tsgo"
	local bin = (vim.fn.executable(local_bin) == 1) and local_bin or "tsgo"
	return { bin, "--lsp", "--stdio" }
end

local function typescript_settings(root)
	local settings = {
		updateImportsOnFileMove = "always",
	}
	if file_exists(root .. "/.yarn/sdks/typescript/lib") then
		settings.tsdk = root .. "/.yarn/sdks/typescript/lib"
	elseif file_exists(root .. "/node_modules/typescript/lib") then
		settings.tsdk = root .. "/node_modules/typescript/lib"
	end
	return settings
end

local function setup_typescript_servers(lsp_capabilities)
	-- tsgo: TS7-native repos. vtsls: everything else.
	-- Exclusive root_dir so a mixed session cannot attach both to one buffer.
	vim.lsp.config.tsgo = {
		cmd = function(dispatchers, config)
			local root = (config and config.root_dir) or buffer_project_root(0)
			return vim.lsp.rpc.start(tsgo_cmd_for(root), dispatchers)
		end,
		filetypes = ts_filetypes,
		root_markers = ts_root_markers,
		root_dir = function(bufnr, on_dir)
			if buffer_uses_tsgo(bufnr) then
				on_dir(buffer_project_root(bufnr))
			end
		end,
		capabilities = lsp_capabilities,
		settings = {
			javascript = {
				updateImportsOnFileMove = "always",
			},
		},
		before_init = function(_, config)
			config.settings = config.settings or {}
			config.settings.typescript = typescript_settings(config.root_dir)
		end,
	}


	vim.lsp.config.vtsls = {
		cmd = { "vtsls", "--stdio" },
		filetypes = ts_filetypes,
		root_markers = ts_root_markers,
		root_dir = function(bufnr, on_dir)
			if not buffer_uses_tsgo(bufnr) then
				on_dir(buffer_project_root(bufnr))
			end
		end,
		capabilities = lsp_capabilities,
		settings = {
			javascript = {
				updateImportsOnFileMove = "always",
			},
			vtsls = {
				enableMoveToFileCodeAction = true,
				autoUseWorkspaceTsdk = true,
			},
		},
		before_init = function(_, config)
			config.settings = config.settings or {}
			config.settings.typescript = typescript_settings(config.root_dir)
		end,
	}

	vim.lsp.enable("tsgo")
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
		{ "nvim-treesitter/nvim-treesitter-textobjects" },
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
		local ts_repeat_move = require("nvim-treesitter-textobjects.repeatable_move")

		local repeat_diagnostic_move = function(forward_move, backward_move)
			local move = function(options)
				if options.forward then
					forward_move()
				else
					backward_move()
				end
			end
			local repeatable_move = ts_repeat_move.make_repeatable_move(move)

			return function()
				repeatable_move({ forward = true })
			end, function()
				repeatable_move({ forward = false })
			end
		end

		local next_error_repeat, prev_error_repeat = repeat_diagnostic_move(move_next_error, move_prev_error)
		local next_diag_repeat, prev_diag_repeat = repeat_diagnostic_move(move_next_diag, move_prev_diag)
		local next_warning_repeat, prev_warning_repeat = repeat_diagnostic_move(move_next_warning, move_prev_warning)

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

		vim.lsp.config("*", {
			capabilities = lsp_capabilities,
		})

		setup_typescript_servers(lsp_capabilities)

		vim.lsp.config.eslint = {
			capabilities = lsp_capabilities,
			flags = {
				debounce_text_changes = 300,
			},
		}

		vim.lsp.config.graphql = {
			capabilities = lsp_capabilities,
			filetypes = { "graphql", "typescriptreact", "javascriptreact", "typescript" },
			root_markers = { ".git" },
		}

		require("mason").setup({})
		require("mason-lspconfig").setup({
			ensure_installed = { "yamlls" },
			automatic_enable = {
				exclude = { "ts_ls", "vtsls", "tsgo", "yamlls" },
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
			if buffer_uses_tsgo(0) then
				print("Organize imports not supported in tsgo")
				return
			end
			vim.cmd("VtsExec add_missing_imports")
			vim.cmd("VtsExec remove_unused_imports")
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
