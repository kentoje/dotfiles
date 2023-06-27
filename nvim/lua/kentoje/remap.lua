vim.keymap.set("n", "<leader>pv", vim.cmd.Ex)

vim.keymap.set('v', 'J', ":m '>+1<CR>gv=gv")
vim.keymap.set('v', 'K', ":m '<-2<CR>gv=gv")

vim.keymap.set('n', '<C-d>', "<C-d>zz")
vim.keymap.set('n', '<C-u>', "<C-u>zz")

vim.keymap.set('n', 'n', "nzzzv")
vim.keymap.set('n', 'N', "Nzzzv")

vim.keymap.set('n', 'x', '"_x')
vim.keymap.set('x', 'p', "\"_dP")

-- Yank on system file
vim.keymap.set('n', '<leader>y', "\"+y")
vim.keymap.set('v', '<leader>y', "\"+y")
vim.keymap.set('n', '<leader>Y', "\"+Y")

-- Tabs
vim.keymap.set('n', 'te', ':tabedit<Return>', { silent = true })
vim.keymap.set('n', 'ss', ':split<Return><C-w>w', { silent = true })
vim.keymap.set('n', 'sv', ':vsplit<Return><C-w>w', { silent = true })

-- Window
vim.keymap.set('n', '<Space>', '<C-w>w')
vim.keymap.set('', 's<left>', '<C-w>h')
vim.keymap.set('', 's<up>', '<C-w>k')
vim.keymap.set('', 's<down>', '<C-w>j')
vim.keymap.set('', 's<right>', '<C-w>l')
vim.keymap.set('', 'sh', '<C-w>h')
vim.keymap.set('', 'sk', '<C-w>k')
vim.keymap.set('', 'sj', '<C-w>j')
vim.keymap.set('', 'sl', '<C-w>l')

vim.keymap.set("n", "<leader>s", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]])

