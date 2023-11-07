vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { desc = "Move line down" })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { desc = "Move line up" })

vim.keymap.set("n", "<C-d>", "<C-d>zz", { desc = "Go down and center cursor" })
vim.keymap.set("n", "<C-u>", "<C-u>zz", { desc = "Go up and center cursor" })

-- vim.keymap.set("n", "n", "nzzzv")
-- vim.keymap.set("n", "N", "Nzzzv")

vim.keymap.set("n", "x", '"_x', { desc = "Do not overwrite clipboard while deleting with 'x'" })
vim.keymap.set("x", "p", '"_dP', { desc = "Do not overwrite clipboard while pasting" })

-- Yank on system clipboard
-- vim.keymap.set("n", "<leader>y", '"+y')
-- vim.keymap.set("v", "<leader>y", '"+y')
-- vim.keymap.set("n", "<leader>Y", '"+Y')

-- Pane
vim.keymap.set("n", "te", ":tabedit<Return>", { silent = true })

vim.keymap.set(
	"n",
	"<leader>sv",
	":split<Return><C-w>w",
	{ silent = false, noremap = true, desc = "Split view in row" }
)
vim.keymap.set(
	"n",
	"<leader>d",
	":vsplit<Return><C-w>w",
	{ silent = false, noremap = true, desc = "Split view in column" }
)
vim.keymap.set(
	"n",
	"<leader>y",
	':let @+ = expand("%")<CR>',
	{ silent = true, noremap = true, desc = "Copy the relative path of the current file" }
)
vim.keymap.set(
	"n",
	"<leader>Y",
	':let @+ = expand("%:p")<CR>',
	{ silent = true, noremap = true, desc = "Copy the absolute path of the current file" }
)
vim.keymap.set("n", "<leader>sr", [[:%s/\<<C-r><C-w>\>/<C-r><C-w>/gI<Left><Left><Left>]], {
	desc = "Search and replace current selection in file",
})
vim.keymap.set("n", "-", require("oil").open, { desc = "Open parent directory in oil" })
vim.keymap.set("n", "<M-s>", ":w<CR>", { silent = true }, { desc = "Mimic MacOS save" })
vim.keymap.set("n", "<leader>w", ":q<CR>", { silent = true, desc = "Mimic MacOS close" })

local function surround_with(char)
	vim.cmd("normal! d")

	if char == "(" then
		vim.cmd("normal! i" .. char .. ")")
	elseif char == "{" then
		vim.cmd("normal! i" .. char .. "}")
	elseif char == "[" then
		vim.cmd("normal! i" .. char .. "]")
	end

	vim.cmd("normal! P")
end

vim.keymap.set("v", "<leader>sw", function()
	surround_with(vim.fn.input("Char to surround: "))
end, { silent = true, desc = "Surround visual mode selection with the given char" })
