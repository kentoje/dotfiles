return {
	"nvim-treesitter/nvim-treesitter",
	build = ":TSUpdate",
	config = function()
		local ts_utils = require("nvim-treesitter.ts_utils")

		require("nvim-treesitter.configs").setup({
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

		local get_json_path = function()
			local node = ts_utils.get_node_at_cursor()
			if not node then
				print("No node found")
				return
			end

			local path = {}

			while node do
				if node:type() == "pair" then
					local key_node = node:child(0) -- First child is the key
					if key_node then
						local key_text = vim.treesitter.get_node_text(key_node, 0)
						table.insert(path, 1, key_text) -- Insert at the beginning
					end
				end
				node = node:parent() -- Move up the tree
			end

			if #path > 0 then
				-- Remove quotes from individual keys and join them
				local cleaned_path = {}

				for _, key in ipairs(path) do
					-- Remove surrounding quotes if they exist
					key = key:gsub('^"(.*)"$', "%1")
					table.insert(cleaned_path, key)
				end
				local json_path = table.concat(cleaned_path, ".")

				vim.fn.system("pbcopy", json_path)
				vim.notify("JSON path copied to clipboard: " .. json_path, vim.log.levels.INFO)
			else
				print("No JSON key found")
			end
		end

		vim.keymap.set("n", "<leader>xjk", function()
			get_json_path()
		end, { silent = true, desc = "Get current JSON path under cursor" })
	end,
}
