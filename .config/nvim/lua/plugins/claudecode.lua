return {
	"coder/claudecode.nvim",
	-- Allows to connect /ide with nvim.
	event = "VeryLazy",
	lazy = false,
	dependencies = { "folke/snacks.nvim" },
	opts = {
		terminal_cmd = "~/.claude/local/claude", -- Point to local installation
	},
	config = true,
	keys = {
		{ "<leader>g", nil, desc = "AI/Claude Code" },
		{ "<leader>gc", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
		{ "<leader>gf", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
		{ "<leader>gr", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
		{ "<leader>gC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
		{ "<leader>gb", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add current buffer" },
		{ "<leader>ga", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
		{
			"<leader>ga",
			"<cmd>ClaudeCodeTreeAdd<cr>",
			desc = "Add file",
			ft = { "NvimTree", "neo-tree", "oil" },
		},
		-- Diff management
		{ "<leader>gy", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
		{ "<leader>gn", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Deny diff" },
	},
}
