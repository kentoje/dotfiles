vim.cmd("set expandtab")

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.cursorline = false

-- vim.bo.expandtab = true
vim.opt.tabstop = 2
vim.opt.softtabstop = 2
vim.opt.shiftwidth = 2
vim.opt.smartindent = true
vim.opt.showmode = false
vim.wo.wrap = false

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.opt.termguicolors = true

vim.opt.scrolloff = 15
vim.opt.signcolumn = "yes"

vim.opt.updatetime = 50

-- disable netrw at the very start of your init.lua
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

vim.g.mapleader = " "

vim.cmd("hi CursorLineNr guifg=#f4b8e4")
vim.cmd("hi LineNr guifg=#6d7083")
vim.opt.cursorline = true
vim.opt.cursorlineopt = "number"
