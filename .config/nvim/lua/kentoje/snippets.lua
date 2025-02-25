local ls = require("luasnip")

local s = ls.snippet
local t = ls.text_node
local i = ls.insert_node

ls.add_snippets("custom", {
	s("funcblock", {
		t({ "function " }),
		i(1),
		t("("),
		i(2),
		t({ ") {", "  " }),
		i(3),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("log", {
		t("console.log({ "),
		i(1),
		t(" });"),
	}),
})

local function find_snippet(snippet_type, snippet_name)
	local snippets = ls.get_snippets(snippet_type)
	for _, snip in ipairs(snippets) do
		if snip.trigger == snippet_name then
			return snip
		end
	end

	return nil
end

local function trigger_snippet(snippet_type, snippet_name)
	local snip = find_snippet(snippet_type, snippet_name)
	if snip then
		vim.cmd("startinsert")
		ls.snip_expand(snip)
	end
end

-- Keymaps using the new function
vim.keymap.set("n", "<leader>sf", function()
	trigger_snippet("custom", "funcblock")
end, { noremap = true, silent = true, desc = "Insert function block snippet" })

vim.keymap.set("n", "<leader>sl", function()
	trigger_snippet("custom", "log")
end, { noremap = true, silent = true, desc = "Insert console.log snippet" })

vim.keymap.set("n", "<leader>sL", function()
	local word = vim.fn.expand("<cword>")
	local snip = find_snippet("custom", "log")

	if snip then
		vim.cmd("normal! o")
		ls.snip_expand(s("log", {
			t("console.log({ "),
			t(word),
			t(" });"),
		}))
	end
end, { noremap = true, silent = true, desc = "Insert console.log with word under cursor" })
