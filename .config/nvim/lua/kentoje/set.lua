vim.cmd("set expandtab")

vim.opt.nu = true
vim.opt.relativenumber = true
vim.opt.conceallevel = 1

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

vim.opt.scrolloff = 20
vim.opt.signcolumn = "yes"

vim.opt.updatetime = 50

-- disable netrw at the very start of your init.lua
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

vim.g.mapleader = " "

vim.opt.cursorline = true
vim.opt.cursorlineopt = "number"
vim.opt.guicursor = "i:block"
