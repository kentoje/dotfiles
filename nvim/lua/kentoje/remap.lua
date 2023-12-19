vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { silent = true, desc = "Move line down" })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { silent = true, desc = "Move line up" })

-- vim.keymap.set("n", "H", "0", { desc = "Go to beginning of line" })
vim.keymap.set("n", "J", "10j", { desc = "Move 10 lines down" })
vim.keymap.set("n", "K", "10k", { desc = "Move 10 lines up" })
-- vim.keymap.set("n", "L", "<S-$>", { desc = "Go to end of line" })

-- vim.keymap.set("n", "<C-d>", "<C-d>zz", { desc = "Go down and center cursor" })
-- vim.keymap.set("n", "<C-u>", "<C-u>zz", { desc = "Go up and center cursor" })

-- vim.keymap.set("n", "n", "nzzzv")
-- vim.keymap.set("n", "N", "Nzzzv")

vim.keymap.set("n", "x", '"_x', { desc = "Do not overwrite clipboard while deleting with 'x'" })
vim.keymap.set("x", "p", '"_dP', { desc = "Do not overwrite clipboard while pasting" })

-- resize
vim.keymap.set("n", "<C-Left>", "5<C-w>>", { noremap = true, silent = true, desc = "Resize left" })
vim.keymap.set("n", "<C-Right>", "5<C-w><", { noremap = true, silent = true, desc = "Resize right" })
vim.keymap.set("n", "<C-Up>", "5<C-w>+", { noremap = true, silent = true, desc = "Resize up" })
vim.keymap.set("n", "<C-Down>", "5<C-w>-", { noremap = true, silent = true, desc = "Resize bottom" })

-- Buffers
-- vim.keymap.set("n", "<M-h>", ":bprev<CR>", { silent = true, desc = "Buffer prev" })
-- vim.keymap.set("n", "<M-l>", ":bnext<CR>", { silent = true, desc = "Buffer next" })

-- Yank on system clipboard
-- vim.keymap.set("n", "<leader>y", '"+y')
-- vim.keymap.set("v", "<leader>y", '"+y')
-- vim.keymap.set("n", "<leader>Y", '"+Y')

vim.keymap.set("n", "<C-d>", ":vsplit<Return><C-w>w", { silent = true, noremap = true, desc = "Split view in column" })
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

vim.keymap.set("n", "<C-s>", ":w<CR>", { silent = true }, { desc = "Mimic MacOS save" })
vim.keymap.set("n", "<M-s>", ":w<CR>", { silent = true }, { desc = "Mimic MacOS save" })
vim.keymap.set("n", "<C-w>", ":q<CR>", { silent = true, desc = "Mimic MacOS close" })

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

-- yank path
-- go to prev buffer if there is
-- open right pane
-- e yanked path

local function get_path()
	local bufnr = vim.api.nvim_get_current_buf()
	local path = vim.api.nvim_buf_get_name(bufnr)
	-- vim.api.nvim_command('let @+ = "' .. path .. '"')
	return path
end

vim.keymap.set("n", "<leader>l", function()
	local path = get_path()

	local buffers = vim.api.nvim_list_bufs()

	if #buffers > 1 then
		vim.cmd(":bprev")
	end

	vim.cmd(":rightbelow vsplit")
	vim.cmd(":e " .. path)
end, { silent = true, desc = "Open current buffer in a right pane" })

vim.keymap.set("n", "<leader>h", function()
	local path = get_path()

	local buffers = vim.api.nvim_list_bufs()

	if #buffers > 1 then
		vim.cmd(":bprev")
	end

	vim.cmd(":vsplit")
	vim.cmd(":e " .. path)
end, { silent = true, desc = "Open current buffer in a left pane" })

local function open_test_file()
	local current_file_path = vim.fn.expand("%:p") -- Get the full path of the current file.
	local current_file_name = vim.fn.expand("%:t:r") -- Get the base name of the current file without extension.
	local current_file_ext = vim.fn.expand("%:e") -- Get the base name of the current file without extension.

	local file_extensions = { current_file_ext, "ts", "tsx" }

	-- loop through file_extensions
	for _, ext in ipairs(file_extensions) do
		local test_file_name = current_file_name .. ".test." .. ext
		local test_file_path = string.format("%s/__tests__/%s", vim.fn.expand("%:p:h"), test_file_name)

		-- check if file exists
		if vim.fn.filereadable(test_file_path) == 1 then
			vim.cmd("edit " .. test_file_path)
			return
		end
	end

	print("Could not find test file...")
end

vim.keymap.set("n", "<leader>t", function()
	vim.cmd(":rightbelow vsplit")
	open_test_file()
end, { noremap = true, silent = true, desc = "Open sibling test file in right pane" })
vim.keymap.set("n", "<leader>T", function()
	open_test_file()
end, { noremap = true, silent = true, desc = "Open sibling test file in right pane" })

-------- GO TO BUFFER INDEX ---------------------------------------------------

local function get_listed_buffers()
	local buffers = vim.tbl_filter(function(b)
		return vim.fn.buflisted(b) == 1
	end, vim.api.nvim_list_bufs())
	return buffers
end

-- Get buffer id from buffer index
local function go_to_buffer(buffer_list_index)
	local buffer_list = get_listed_buffers()
	local buffer_id = buffer_list[buffer_list_index]
	if buffer_id ~= nil then
		vim.api.nvim_command("buffer " .. buffer_id)
	end
end

vim.keymap.set("n", "<leader>1", function()
	go_to_buffer(1)
end, { noremap = true, silent = false })
vim.keymap.set("n", "<leader>2", function()
	go_to_buffer(2)
end, { noremap = true, silent = false })
vim.keymap.set("n", "<leader>3", function()
	go_to_buffer(3)
end, { noremap = true, silent = false })
vim.keymap.set("n", "<leader>4", function()
	go_to_buffer(4)
end, { noremap = true, silent = false })
vim.keymap.set("n", "<leader>5", function()
	go_to_buffer(5)
end, { noremap = true, silent = false })
