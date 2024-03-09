return {
	"jackMort/ChatGPT.nvim",
	event = "VeryLazy",
	config = function()
		local chatgpt = require("chatgpt")
		local home = vim.fn.expand("$HOME")

		chatgpt.setup({
			api_key_cmd = "gpg --decrypt " .. home .. "/.gnupg/.secrets/openai-api-key.txt.gpg",
			openai_params = {
				model = "gpt-4",
				-- frequency_penalty = 0,
				-- presence_penalty = 0,
				-- max_tokens = 300,
				-- temperature = 0,
				-- top_p = 1,
				-- n = 1,
			},
			openai_edit_params = {
				model = "gpt-4",
				-- frequency_penalty = 0,
				-- presence_penalty = 0,
				-- temperature = 0,
				-- top_p = 1,
				-- n = 1,
			},
		})

		vim.keymap.set("x", "<leader>xce", function()
			chatgpt.edit_with_instructions()
		end, {
			silent = true,
			desc = "Edit with instructions",
		})

		vim.keymap.set("n", "<leader>xcc", "<cmd>ChatGPT<cr>", {
			silent = true,
			desc = "ChatGPT",
		})

		vim.keymap.set("n", "<leader>xcC", "<cmd>ChatGPTCompleteCode<cr>", {
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
