local treesitter_parsers = {
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
}

return {
	"nvim-treesitter/nvim-treesitter",
	branch = "main",
	lazy = false,
	build = function()
		require("nvim-treesitter").install(treesitter_parsers):wait(300000)
	end,
	config = function()
		require("nvim-treesitter").setup()

		vim.filetype.add({
			extension = {
				mdx = "mdx",
			},
		})
		vim.treesitter.language.register("markdown", "mdx")

		local treesitter_highlighting = vim.api.nvim_create_augroup("treesitter_highlighting", { clear = true })
		vim.api.nvim_create_autocmd("FileType", {
			group = treesitter_highlighting,
			pattern = {
				"c",
				"rust",
				"lua",
				"vim",
				"help",
				"query",
				"javascript",
				"typescript",
				"typescriptreact",
				"yaml",
				"gitignore",
				"graphql",
				"markdown",
				"mdx",
				"fish",
			},
			callback = function(args)
				pcall(vim.treesitter.start, args.buf)
			end,
		})

		local get_json_path = function()
			local node = vim.treesitter.get_node()
			if not node then
				print("No node found")
				return
			end

			local path = {}

			while node do
				if node:type() == "pair" then
					local key_node = node:child(0)
					if key_node then
						local key_text = vim.treesitter.get_node_text(key_node, 0)
						table.insert(path, 1, key_text)
					end
				end
				node = node:parent()
			end

			if #path > 0 then
				local cleaned_path = {}

				for _, key in ipairs(path) do
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

		vim.keymap.set("n", "<leader>xjk", get_json_path, { silent = true, desc = "Get JSON path under cursor" })
	end,
}
