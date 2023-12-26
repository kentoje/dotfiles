return {
	"jackMort/ChatGPT.nvim",
	event = "VeryLazy",
	config = function()
		local chatgpt = require("chatgpt")
		chatgpt.setup()

		vim.keymap.set("x", "<leader>e", function()
			chatgpt.edit_with_instructions()
		end, {
			silent = true,
			desc = "Edit with instructions",
		})

		vim.keymap.set("n", "<leader>xc", "<cmd>ChatGPT<cr>", {
			silent = true,
			desc = "ChatGPT",
		})

		vim.keymap.set("n", "<leader>xC", "<cmd>ChatGPTCompleteCode<cr>", {
			silent = true,
			desc = "ChatGPTCompleteCode",
		})
	end,
	dependencies = {
		"MunifTanjim/nui.nvim",
		"nvim-lua/plenary.nvim",
		"nvim-telescope/telescope.nvim",
	},
	cmd = {
		"ChatGPT",
		"ChatGPTActAs",
		"ChatGPTCompleteCode",
		"ChatGPTEditWithInstructions",
		"ChatGPTRun",
	},
}
