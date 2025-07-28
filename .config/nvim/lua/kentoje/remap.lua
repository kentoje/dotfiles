local function get_path()
	local bufnr = vim.api.nvim_get_current_buf()
	local path = vim.api.nvim_buf_get_name(bufnr)
	-- vim.api.nvim_command('let @+ = "' .. path .. '"')
	return path
end

vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv", { silent = true, desc = "Move line down" })
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv", { silent = true, desc = "Move line up" })

vim.keymap.set("n", "H", "0", { desc = "Go to beginning of line" })
vim.keymap.set("n", "J", "10j", { desc = "Move 10 lines down" })
vim.keymap.set("n", "K", "10k", { desc = "Move 10 lines up" })
vim.keymap.set("n", "L", "<S-$>", { desc = "Go to end of line" })

vim.keymap.set("v", "$", "$h", { noremap = true })

vim.keymap.set("n", "x", '"_x', { desc = "Do not overwrite clipboard while deleting with 'x'" })
vim.keymap.set("x", "p", '"_dP', { desc = "Do not overwrite clipboard while pasting" })

vim.keymap.set("n", "<C-Left>", "5<C-w>>", { noremap = true, silent = true, desc = "Resize left" })
vim.keymap.set("n", "<C-Right>", "5<C-w><", { noremap = true, silent = true, desc = "Resize right" })
vim.keymap.set("n", "<C-Up>", "5<C-w>+", { noremap = true, silent = true, desc = "Resize up" })
vim.keymap.set("n", "<C-Down>", "5<C-w>-", { noremap = true, silent = true, desc = "Resize bottom" })

vim.keymap.set("n", "[b", ":bprev<CR>", { silent = true, desc = "Buffer prev" })
vim.keymap.set("n", "]b", ":bnext<CR>", { silent = true, desc = "Buffer next" })

-- sort json file
vim.keymap.set("n", "<leader>xjs", ":%!jq -S .<CR>", { silent = true, desc = "Sort current JSON file" })
vim.keymap.set("v", "<leader>xjs", ":'<,'>!jq -S .<CR>", { silent = true, desc = "Sort current JSON selection" })

vim.keymap.set("n", "<leader>bn", ":vnew<CR>", { silent = true, noremap = true, desc = "Open a new vertical buffer" })
vim.keymap.set("n", "<leader>bN", ":new<CR>", { silent = true, noremap = true, desc = "Open a new horizontal buffer" })
vim.keymap.set(
	"n",
	"<leader>d",
	":vsplit<Return><C-w>w",
	{ silent = true, noremap = true, desc = "Split view in column" }
)
vim.keymap.set(
	"n",
	"<leader>D",
	":split<Return><C-w>w",
	{ silent = true, noremap = true, desc = "Split view horizontal" }
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

-- yank path
-- go to prev buffer if there is
-- open right pane
-- e yanked path

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

local function open_test_file(should_split)
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
			if should_split then
				vim.cmd(":rightbelow vsplit")
			end

			vim.cmd("edit " .. test_file_path)
			return
		end
	end

	print("Could not find test file...")
end

vim.keymap.set("n", "<leader>t", function()
	open_test_file(true)
end, { noremap = true, silent = true, desc = "Open sibling test file in right pane" })

vim.keymap.set("n", "<leader>T", function()
	open_test_file(false)
end, { noremap = true, silent = true, desc = "Open sibling test file" })

vim.keymap.set("n", "[[", function()
	vim.cmd("normal! #")
end, { noremap = true, silent = true, desc = "Go to previous occurence" })

vim.keymap.set("n", "]]", function()
	vim.cmd("normal! *")
end, { noremap = true, silent = true, desc = "Go to next occurence" })

vim.keymap.set("v", "<leader>ca", function()
	local result = vim.fn.input("Append text to end of selected lines")
	return ":'<,'>norm A" .. result .. "<CR>"
end, { expr = true, desc = "Append text to end of selected lines" })

vim.keymap.set("v", "<leader>ci", function()
	local result = vim.fn.input("Insert text to beginning of selected lines")
	return ":'<,'>norm I" .. result .. "<CR>"
end, { expr = true, desc = "Insert text to beginning of selected lines" })

vim.keymap.set("v", "<leader>y", function()
	local start_pos = vim.fn.getpos("v")
	local end_pos = vim.fn.getpos(".")
	local start_line = math.min(start_pos[2], end_pos[2])
	local end_line = math.max(start_pos[2], end_pos[2])
	local path = vim.fn.expand("%")
	local result = "(FILE: @" .. path .. " LINES: [start: " .. start_line .. ", end: " .. end_line .. "])"
	vim.fn.setreg("+", result)
	print("Copied: " .. result)
end, { desc = "Copy path with line range" })
