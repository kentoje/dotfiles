return {
	{ "MaximilianLloyd/ascii.nvim", dependencies = {
		"MunifTanjim/nui.nvim",
	} },
	{
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
	},
	"saadparwaiz1/cmp_luasnip",
	"rafamadriz/friendly-snippets",
	"svban/YankAssassin.vim",
	"windwp/nvim-autopairs",
	-- { "nvim-treesitter/nvim-treesitter", { run = ":TSUpdate" } },
	"nvim-treesitter/playground",
	"mbbill/undotree",
}
