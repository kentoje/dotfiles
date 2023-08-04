vim.cmd([[packadd packer.nvim]])

return require("packer").startup(function(use)
	-- Packer can manage itself
	use({ "MaximilianLloyd/ascii.nvim", requires = {
		"MunifTanjim/nui.nvim",
	} })
	use("sindrets/diffview.nvim")
	use("windwp/nvim-ts-autotag")
	use("windwp/nvim-autopairs")
	use("ThePrimeagen/harpoon")
	use("ray-x/lsp_signature.nvim")
	use({ "catppuccin/nvim", as = "catppuccin" })
	use("romgrk/barbar.nvim")
	use("lewis6991/gitsigns.nvim")
	use("christoomey/vim-tmux-navigator")
	use("wbthomason/packer.nvim")
	use("nvim-tree/nvim-web-devicons")
	use({
		"folke/trouble.nvim",
		requires = { "nvim-tree/nvim-web-devicons" },
	})
	use({
		"nvim-lualine/lualine.nvim",
		requires = { "nvim-tree/nvim-web-devicons", opt = true },
	})
	use({
		"nvim-telescope/telescope.nvim",
		tag = "0.1.1",
		requires = { { "nvim-lua/plenary.nvim" } },
	})
	-- Might add it later
	-- use({
	-- 	"nvim-tree/nvim-tree.lua",
	-- 	requires = {
	-- 		"nvim-tree/nvim-web-devicons", -- optional
	-- 	},
	-- })
	use({
		"stevearc/oil.nvim",
		config = function()
			require("oil").setup()
		end,
	})
	use({
		"numToStr/Comment.nvim",
	})
	use("nvim-treesitter/nvim-treesitter", { run = ":TSUpdate" })
	use("nvim-treesitter/playground")
	use("mbbill/undotree")
	use({
		"goolord/alpha-nvim",
	})
	use({
		"folke/neodev.nvim",
	})
	use({ "mhartington/formatter.nvim" })
	use({
		"nvim-neotest/neotest",
		requires = {
			"nvim-lua/plenary.nvim",
			"nvim-treesitter/nvim-treesitter",
			"antoinemadec/FixCursorHold.nvim",
			"haydenmeade/neotest-jest",
		},
	})
	use({
		"VonHeikemen/lsp-zero.nvim",
		branch = "v2.x",
		requires = {
			-- LSP Support
			{ "neovim/nvim-lspconfig" }, -- Required
			{ -- Optional
				"williamboman/mason.nvim",
				run = function()
					pcall(vim.cmd, "MasonUpdate")
				end,
			},
			{ "williamboman/mason-lspconfig.nvim" }, -- Optional

			-- Autocompletion
			{ "hrsh7th/nvim-cmp" }, -- Required
			{ "hrsh7th/cmp-nvim-lsp" }, -- Required
			{ "L3MON4D3/LuaSnip" }, -- Required
		},
	})
end)
