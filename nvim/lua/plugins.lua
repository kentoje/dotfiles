local status, packer = pcall(require, 'packer')

if (not status) then
  print("Packer is not installed")
  return
end

vim.cmd [[packadd packer.nvim]]

packer.startup(function(use)
  use 'wbthomason/packer.nvim'
  -- use {
  --   'svrana/neosolarized.nvim',
  --   requires = { 'tjdevries/colorbuddy.nvim' }
  -- }
  use 'numToStr/Comment.nvim'
  use 'catppuccin/nvim'
  use 'nvim-lualine/lualine.nvim' -- Statusline
  use 'neovim/nvim-lspconfig'
  use 'hrsh7th/cmp-buffer' -- nvim-cmp source for buffer words
  use 'hrsh7th/cmp-nvim-lsp' -- nvim-cmp source for neovim's built-in LSP
  use 'hrsh7th/nvim-cmp' -- Completion
  use 'onsails/lspkind-nvim'
  use 'L3MON4D3/LuaSnip'
  use {
    'nvim-treesitter/nvim-treesitter',
    run = function() require('nvim-treesitter.install').update({ with_sync = true }) end,
  }
  -- use {
  --   'nvim-tree/nvim-tree.lua',
  --   requires = {
  --     'nvim-tree/nvim-web-devicons', -- optional, for file icons
  --   },
  --   tag = 'nightly' -- optional, updated every week. (see issue #1193)
  -- }
  use 'windwp/nvim-autopairs'
  use 'windwp/nvim-ts-autotag'
  use 'nvim-lua/plenary.nvim'
  use 'nvim-telescope/telescope.nvim'
  use 'nvim-telescope/telescope-file-browser.nvim'
  use 'kyazdani42/nvim-web-devicons'
  use 'akinsho/nvim-bufferline.lua'
  use 'norcalli/nvim-colorizer.lua'
  use 'glepnir/lspsaga.nvim'
  use 'jose-elias-alvarez/null-ls.nvim'
  use 'MunifTanjim/prettier.nvim'
  use 'lewis6991/gitsigns.nvim'
  use 'dinhhuy258/git.nvim'
  use 'williamboman/mason.nvim'
  use 'williamboman/mason-lspconfig.nvim'
  -- use 'glepnir/dashboard-nvim'
end)
