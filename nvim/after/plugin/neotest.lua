if not vim.g.vscode then
	local neotest = require("neotest")

	neotest.setup({
		adapters = {
			require("neotest-jest")({
				-- jestCommand = "yarn jest -o",
				jestCommand = "yarn jest",
				env = { CI = true },
				jestConfigFile = "jest.config.js",
				cwd = function(path)
					return vim.fn.getcwd()
				end,
			}),
		},
		benchmark = {
			enabled = true,
		},
		consumers = {},
		default_strategy = "integrated",
		diagnostic = {
			enabled = true,
			severity = 1,
		},
		discovery = {
			concurrent = 0,
			enabled = true,
		},
		floating = {
			border = "rounded",
			max_height = 0.6,
			max_width = 0.6,
			options = {},
		},
		highlights = {
			adapter_name = "NeotestAdapterName",
			border = "NeotestBorder",
			dir = "NeotestDir",
			expand_marker = "NeotestExpandMarker",
			failed = "NeotestFailed",
			file = "NeotestFile",
			focused = "NeotestFocused",
			indent = "NeotestIndent",
			marked = "NeotestMarked",
			namespace = "NeotestNamespace",
			passed = "NeotestPassed",
			running = "NeotestRunning",
			select_win = "NeotestWinSelect",
			skipped = "NeotestSkipped",
			target = "NeotestTarget",
			test = "NeotestTest",
			unknown = "NeotestUnknown",
			watching = "NeotestWatching",
		},
		icons = {
			child_indent = "│",
			child_prefix = "├",
			collapsed = "─",
			expanded = "╮",
			failed = "",
			final_child_indent = " ",
			final_child_prefix = "╰",
			non_collapsible = "─",
			passed = "",
			running = "",
			running_animated = { "/", "|", "\\", "-", "/", "|", "\\", "-" },
			skipped = "",
			unknown = "",
			watching = "",
		},
		jump = {
			enabled = true,
		},
		log_level = 3,
		output = {
			enabled = true,
			open_on_run = "short",
		},
		output_panel = {
			enabled = true,
			open = "botright split | resize 15",
		},
		projects = {},
		quickfix = {
			enabled = true,
			open = false,
		},
		run = {
			enabled = true,
		},
		running = {
			concurrent = true,
		},
		state = {
			enabled = true,
		},
		status = {
			enabled = true,
			signs = true,
			virtual_text = false,
		},
		strategies = {
			integrated = {
				height = 40,
				width = 120,
			},
		},
		summary = {
			animated = true,
			enabled = true,
			expand_errors = true,
			follow = true,
			mappings = {
				attach = "a",
				clear_marked = "M",
				clear_target = "T",
				debug = "d",
				debug_marked = "D",
				expand = { "<CR>", "<2-LeftMouse>" },
				expand_all = "e",
				jumpto = "i",
				mark = "m",
				next_failed = "J",
				output = "o",
				prev_failed = "K",
				run = "r",
				run_marked = "R",
				short = "O",
				stop = "u",
				target = "t",
				watch = "w",
			},
			open = "botright vsplit | vertical resize 50",
		},
		watch = {
			enabled = true,
			symbol_queries = {
				lua = '        ;query\n        ;Captures module names in require calls\n        (function_call\n          name: ((identifier) @function (#eq? @function "require"))\n          arguments: (arguments (string) @symbol))\n      ',
				python = "        ;query\n        ;Captures imports and modules they're imported from\n        (import_from_statement (_ (identifier) @symbol))\n        (import_statement (_ (identifier) @symbol))\n      ",
			},
		},
	})

	-- run the current file
	vim.keymap.set("n", "<leader>ta", function()
		neotest.run.run(vim.fn.expand("%"))
	end, { desc = "Run all tests of the current file" })

	vim.keymap.set("n", "<leader>ts", function()
		neotest.run.stop(vim.fn.expand("%"))
	end, { desc = "Stop all running tests" })
	--
	-- run nearer test
	vim.keymap.set("n", "<leader>tc", function()
		neotest.run.run()
	end, { desc = "Run the closest test" })

	-- Watch does not work
	-- vim.keymap.set("n", "<leader>tw", function()
	-- 	neotest.watch.toggle(vim.fn.expand("%"))
	-- end, {})
	--
	-- vim.keymap.set("n", "<leader>tW", function()
	-- 	neotest.watch.toggle()
	-- end, {})

	-- toggle tree result
	vim.keymap.set("n", "<leader>tt", function()
		neotest.summary.toggle()
	end, { desc = "Toggle the neotest pane" })

	-- display test output
	vim.keymap.set("n", "<leader>to", function()
		neotest.output.open({ enter = true })
	end, { desc = "Display the neotest output" })
end
