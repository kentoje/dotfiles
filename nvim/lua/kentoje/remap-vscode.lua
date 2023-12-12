vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv")

vim.keymap.set("n", "H", "<S-^>", { desc = "Go to beginning of line" })
vim.keymap.set("n", "J", "10j", { desc = "Move 10 lines down" })
vim.keymap.set("n", "K", "10k", { desc = "Move 10 lines up" })
vim.keymap.set("n", "L", "<S-$>", { desc = "Go to end of line" })

vim.keymap.set("n", "x", '"_x')
vim.keymap.set("x", "p", '"_dP')

-- Yank on system clipboard
-- vim.keymap.set("n", "<leader>y", '"+y')
-- vim.keymap.set("v", "<leader>y", '"+y')
-- vim.keymap.set("n", "<leader>Y", '"+Y')
