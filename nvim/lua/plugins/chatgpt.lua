return {
	"jackMort/ChatGPT.nvim",
	event = "VeryLazy",
	config = function()
		require("chatgpt").setup()
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
	keys = function()
		local chatgpt = require("chatgpt")
		local wk = require("which-key")

		wk.register({
			e = {
				function()
					chatgpt.edit_with_instructions()
				end,
				"Edit with instructions",
			},
		}, {
			prefix = "<leader>",
			mode = "v",
		})

		return {
			{ "<leader>xc", "<cmd>ChatGPT<cr>", desc = "ChatGPT" },
			{ "<leader>xC", "<cmd>ChatGPTCompleteCode<cr>", desc = "ChatGPTCompleteCode" },
		}
	end,
}
