return {
	"epwalsh/obsidian.nvim",
	version = "*", -- recommended, use latest release instead of latest commit
	lazy = true,
	ft = "markdown",
	-- Replace the above line with this if you only want to load obsidian.nvim for markdown files in your vault:
	-- event = {
	--   -- If you want to use the home shortcut '~' here you need to call 'vim.fn.expand'.
	--   -- E.g. "BufReadPre " .. vim.fn.expand "~" .. "/my-vault/**.md"
	--   "BufReadPre path/to/my-vault/**.md",
	--   "BufNewFile path/to/my-vault/**.md",
	-- },
	dependencies = {
		-- Required.
		"nvim-lua/plenary.nvim",
		"hrsh7th/nvim-cmp",
		"nvim-telescope/telescope.nvim",
		"nvim-treesitter",

		-- see below for full list of optional dependencies 👇
	},
	config = function()
		local obsidian = require("obsidian").setup({
			workspaces = {
				{
					name = "personal",
					path = "/Users/kento/Documents/github/kentoje/obsidian-vault",
				},
			},

			-- see below for full list of options 👇
			daily_notes = {
				-- Optional, if you keep daily notes in a separate directory.
				folder = "root/dailies",
				-- Optional, if you want to change the date format for the ID of daily notes.
				date_format = "%Y-%m-%d",
				-- Optional, if you want to change the date format of the default alias of daily notes.
				alias_format = "%B %-d, %Y",
				-- Optional, if you want to automatically insert a template from your template directory like 'daily.md'
				template = nil,
			},

			completion = {
				-- Set to false to disable completion.
				nvim_cmp = true,

				-- Trigger completion at 2 chars.
				min_chars = 2,

				-- Where to put new notes created from completion. Valid options are
				--  * "current_dir" - put new notes in same directory as the current buffer.
				--  * "notes_subdir" - put new notes in the default notes subdirectory.
				new_notes_location = "current_dir",

				-- Control how wiki links are completed with these (mutually exclusive) options:
				--
				-- 1. Whether to add the note ID during completion.
				-- E.g. "[[Foo" completes to "[[foo|Foo]]" assuming "foo" is the ID of the note.
				-- Mutually exclusive with 'prepend_note_path' and 'use_path_only'.
				prepend_note_id = true,
				-- 2. Whether to add the note path during completion.
				-- E.g. "[[Foo" completes to "[[notes/foo|Foo]]" assuming "notes/foo.md" is the path of the note.
				-- Mutually exclusive with 'prepend_note_id' and 'use_path_only'.
				prepend_note_path = false,
				-- 3. Whether to only use paths during completion.
				-- E.g. "[[Foo" completes to "[[notes/foo]]" assuming "notes/foo.md" is the path of the note.
				-- Mutually exclusive with 'prepend_note_id' and 'prepend_note_path'.
				use_path_only = false,
			},

			templates = {
				subdir = "templates",
				date_format = "%Y-%m-%d",
				time_format = "%H:%M",
				-- A map for custom variables, the key should be the variable and the value a function
				substitutions = {},
			},

			open_notes_in = "current",

			ui = {
				enable = true, -- set to false to disable all additional syntax features
				update_debounce = 200, -- update delay after a text change (in milliseconds)
				-- Define how various check-boxes are displayed
				checkboxes = {
					-- NOTE: the 'char' value has to be a single character, and the highlight groups are defined below.
					[" "] = { char = "󰄱", hl_group = "ObsidianTodo" },
					["x"] = { char = "", hl_group = "ObsidianDone" },
					[">"] = { char = "", hl_group = "ObsidianRightArrow" },
					["~"] = { char = "󰰱", hl_group = "ObsidianTilde" },
					-- Replace the above with this if you don't have a patched font:
					-- [" "] = { char = "☐", hl_group = "ObsidianTodo" },
					-- ["x"] = { char = "✔", hl_group = "ObsidianDone" },

					-- You can also add more custom ones...
				},
				external_link_icon = { char = "", hl_group = "ObsidianExtLinkIcon" },
				-- Replace the above with this if you don't have a patched font:
				-- external_link_icon = { char = "", hl_group = "ObsidianExtLinkIcon" },
				reference_text = { hl_group = "ObsidianRefText" },
				highlight_text = { hl_group = "ObsidianHighlightText" },
				tags = { hl_group = "ObsidianTag" },
				hl_groups = {
					-- The options are passed directly to `vim.api.nvim_set_hl()`. See `:help nvim_set_hl`.
					ObsidianTodo = { bold = true, fg = "#f78c6c" },
					ObsidianDone = { bold = true, fg = "#89ddff" },
					ObsidianRightArrow = { bold = true, fg = "#f78c6c" },
					ObsidianTilde = { bold = true, fg = "#ff5370" },
					ObsidianRefText = { underline = true, fg = "#c792ea" },
					ObsidianExtLinkIcon = { fg = "#c792ea" },
					ObsidianTag = { italic = true, fg = "#89ddff" },
					ObsidianHighlightText = { bg = "#75662e" },
				},
			},

			attachments = {
				-- The default folder to place images in via `:ObsidianPasteImg`.
				-- If this is a relative path it will be interpreted as relative to the vault root.
				-- You can always override this per image by passing a full path to the command instead of just a filename.
				img_folder = "assets/images", -- This is the default
				-- A function that determines the text to insert in the note when pasting an image.
				-- It takes two arguments, the `obsidian.Client` and a plenary `Path` to the image file.
				-- This is the default implementation.
				---@param client obsidian.Client
				---@param path Path the absolute path to the image file
				---@return string
				img_text_func = function(client, path)
					local link_path
					local vault_relative_path = client:vault_relative_path(path)
					if vault_relative_path ~= nil then
						-- Use relative path if the image is saved in the vault dir.
						link_path = vault_relative_path
					else
						-- Otherwise use the absolute path.
						link_path = tostring(path)
					end
					local display_name = vim.fs.basename(link_path)
					return string.format("![%s](%s)", display_name, link_path)
				end,
			},
			yaml_parser = "native",
		})

		vim.keymap.set("n", "<leader>xon", ":ObsidianNew<CR>", { desc = "Create a new note", silent = true })
		vim.keymap.set(
			"n",
			"<leader>xop",
			":ObsidianQuickSwitch<CR>",
			{ desc = "Navigate through notes", silent = true }
		)
		vim.keymap.set(
			"n",
			"<leader>xob",
			":ObsidianBacklinks<CR>",
			{ desc = "List of references of current buffer", silent = true }
		)
		vim.keymap.set("n", "<leader>xos", ":ObsidianSearch<CR>", { desc = "Search for notes", silent = true })
		vim.keymap.set(
			"n",
			"<leader>xof",
			":ObsidianFollowLink vsplit <CR>",
			{ desc = "Follow link in vertical split", silent = true }
		)
		vim.keymap.set(
			"n",
			"<leader>xot",
			":ObsidianToday<CR>",
			{ desc = "Open / Create note for today", silent = true }
		)
		vim.keymap.set(
			"n",
			"<leader>xoT",
			":ObsidianTomorrow<CR>",
			{ desc = "Create note for tomorrow", silent = true }
		)
		vim.keymap.set("n", "<leader>xoy", ":ObsidianYesterday<CR>", { desc = "Open yesterday's note", silent = true })
	end,
}
