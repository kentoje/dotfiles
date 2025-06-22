return {
	"rmagatti/goto-preview",
	enabled = false,
	event = "BufEnter",
	config = function()
		local go_to_preview = require("goto-preview")
		go_to_preview.setup({
			width = 200,
			height = 30,
		})

		vim.keymap.set(
			"n",
			"<leader>g",
			go_to_preview.goto_preview_definition,
			{ silent = true, desc = "Peek definition" }
		)
		-- vim.keymap.set("n", "gR", go_to_preview.goto_preview_references, { silent = true, desc = "Lookup references" })
	end,
}
