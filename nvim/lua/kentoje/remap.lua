vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv")

vim.keymap.set("n", "<C-d>", "<C-d>zz")
vim.keymap.set("n", "<C-u>", "<C-u>zz")

vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

vim.keymap.set("n", "x", '"_x')
vim.keymap.set("x", "p", '"_dP')

-- Yank on system clipboard
-- vim.keymap.set("n", "<leader>y", '"+y')
-- vim.keymap.set("v", "<leader>y", '"+y')
-- vim.keymap.set("n", "<leader>Y", '"+Y')

-- Pane
vim.keymap.set("n", "te", ":tabedit<Return>", { silent = true })

vim.keymap.set("n", '<leader>sv"', ":split<Return><C-w>w", { silent = false, noremap = true })
vim.keymap.set("n", "<leader>ss", ":vsplit<Return><C-w>w", { silent = false, noremap = true })
vim.keymap.set("n", "<leader>y", ':let @+ = expand("%")<CR>', { silent = true, noremap = true })
vim.keymap.set("n", "<leader>Y", ':let @+ = expand("%:p")<CR>', { silent = true, noremap = true })
vim.keymap.set("n", "<leader>sr", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]])
vim.keymap.set("n", "-", require("oil").open, { desc = "Open parent directory" })
vim.keymap.set("n", "<M-s>", ":w<CR>", { silent = true })
vim.keymap.set("n", "<leader>w", ":q<CR>", { silent = true })
