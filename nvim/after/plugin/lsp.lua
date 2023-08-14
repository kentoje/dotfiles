if not vim.g.vscode then
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

	require("lsp_signature").setup({
		debug = false, -- set to true to enable debug logging
		log_path = vim.fn.stdpath("cache") .. "/lsp_signature.log", -- log dir when debug is on
		-- default is  ~/.cache/nvim/lsp_signature.log
		verbose = false, -- show debug line number

		bind = true, -- This is mandatory, otherwise border config won't get registered.
		-- If you want to hook lspsaga or other signature handler, pls set to false
		doc_lines = 10, -- will show two lines of comment/doc(if there are more than two lines in doc, will be truncated);
		-- set to 0 if you DO NOT want any API comments be shown
		-- This setting only take effect in insert mode, it does not affect signature help in normal
		-- mode, 10 by default

		max_height = 12, -- max height of signature floating_window
		max_width = 80, -- max_width of signature floating_window
		noice = false, -- set to true if you using noice to render markdown
		wrap = true, -- allow doc/signature text wrap inside floating_window, useful if your lsp return doc/sig is too long

		floating_window = true, -- show hint in a floating window, set to false for virtual text only mode

		floating_window_above_cur_line = true, -- try to place the floating above the current line when possible Note:
		-- will set to true when fully tested, set to false will use whichever side has more space
		-- this setting will be helpful if you do not want the PUM and floating win overlap

		floating_window_off_x = 1, -- adjust float windows x position.
		-- can be either a number or function
		floating_window_off_y = 0, -- adjust float windows y position. e.g -2 move window up 2 lines; 2 move down 2 lines
		-- can be either number or function, see examples

		close_timeout = 4000, -- close floating window after ms when laster parameter is entered
		fix_pos = false, -- set to true, the floating window will not auto-close until finish all parameters
		hint_enable = false, -- virtual hint enable
		hint_prefix = "🐼 ", -- Panda for parameter, NOTE: for the terminal not support emoji, might crash
		hint_scheme = "String",
		hint_inline = function()
			return false
		end, -- should the hint be inline(nvim 0.10 only)?  default false
		hi_parameter = "LspSignatureActiveParameter", -- how your parameter will be highlight
		handler_opts = {
			border = "rounded", -- double, rounded, single, shadow, none, or a table of borders
		},

		always_trigger = false, -- sometime show signature on new line or in middle of parameter can be confusing, set it to false for #58

		auto_close_after = nil, -- autoclose signature float win after x sec, disabled if nil.
		extra_trigger_chars = {}, -- Array of extra characters that will trigger signature completion, e.g., {"(", ","}
		zindex = 200, -- by default it will be on top of all floating windows, set to <= 50 send it to bottom

		padding = "", -- character to pad on left and right of signature can be ' ', or '|'  etc

		transparency = nil, -- disabled by default, allow floating win transparent value 1~100
		shadow_blend = 36, -- if you using shadow as border use this set the opacity
		shadow_guibg = "Black", -- if you using shadow as border use this set the color e.g. 'Green' or '#121315'
		timer_interval = 1000, -- default timer check interval set to lower value if you want to reduce latency
		toggle_key = nil, -- toggle signature on and off in insert mode,  e.g. toggle_key = '<M-x>'
		toggle_key_flip_floatwin_setting = false, -- true: toggle float setting after toggle key pressed

		select_signature_key = nil, -- cycle to next signature, e.g. '<M-n>' function overloading
		move_cursor_key = nil, -- imap, use nvim_set_current_win to move cursor between current win and floating
	})

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
		sources = cmp.config.sources({
			{ name = "luasnip" },
			{
				name = "nvim_lsp",
				entry_filter = function(entry, context)
					local kind = entry:get_kind()
					local node = ts_utils.get_node_at_cursor():type()

					if node == "arguments" then
						-- 6 means variables
						if kind == 6 then
							return true
						else
							return false
						end
					end

					return true
				end,
			},
		}),
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
end
