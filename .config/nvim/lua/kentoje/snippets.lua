local ls = require("luasnip")

local s = ls.snippet
local t = ls.text_node
local i = ls.insert_node
local f = ls.function_node

ls.add_snippets("custom", {
	s("snip_funcblock", {
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
	s("snip_log", {
		t("console.log({ "),
		i(1),
		t(" });"),
	}),
})

ls.add_snippets("custom", {
	s("snip_funcarrow", {
		t("const "),
		i(1),
		t(" = ("),
		i(2),
		t(") => {"),
		t({ "", "  " }),
		i(3),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("snip_reactcomp", {
		t("function "),
		i(1),
		t("({ "),
		i(2),
		t(" }): "),
		i(3),
		t(" {"),
		t({ "", "  return (" }),
		t("<"),
		i(4),
		t(">"),
		i(5),
		t("</"),
		f(function(args)
			return args[1]
		end, { 4 }),
		t(">"),
		t({ "", "  )" }),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("snip_if", {
		t("if("),
		i(1),
		t(") {"),
		t({ "", "  " }),
		i(2),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("snip_ifelse", {
		t("if ("),
		i(1),
		t(") {"),
		t({ "", "  " }),
		i(2),
		t({ "", "} else {" }),
		t({ "", "  " }),
		i(3),
		t({ "", "}" }),
	}),
})
ls.add_snippets("custom", {
	s("snip_htmltag", {
		t("<"),
		i(1, "tag"),
		t(">"),
		i(2, "content"),
		t("</"),
		f(function(args)
			return args[1]
		end, { 1 }),
		t(">"),
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

vim.keymap.set("n", "<leader>sff", function()
	trigger_snippet("custom", "snip_funcblock")
end, { noremap = true, silent = true, desc = "Insert function block snippet" })

vim.keymap.set("n", "<leader>sfa", function()
	trigger_snippet("custom", "snip_funcarrow")
end, { noremap = true, silent = true, desc = "Insert arrow function snippet" })

vim.keymap.set("n", "<leader>sc", function()
	trigger_snippet("custom", "snip_reactcomp")
end, { noremap = true, silent = true, desc = "Insert react component" })

vim.keymap.set("n", "<leader>sl", function()
	trigger_snippet("custom", "snip_log")
end, { noremap = true, silent = true, desc = "Insert console.log snippet" })

vim.keymap.set("n", "<leader>sii", function()
	trigger_snippet("custom", "snip_if")
end, { noremap = true, silent = true, desc = "Insert if snippet" })

vim.keymap.set("n", "<leader>sie", function()
	trigger_snippet("custom", "snip_ifelse")
end, { noremap = true, silent = true, desc = "Insert if else snippet" })

vim.keymap.set("n", "<leader>st", function()
	trigger_snippet("custom", "snip_htmltag")
end, { noremap = true, silent = true, desc = "Insert html tag" })

vim.keymap.set("n", "<leader>sL", function()
	local word = vim.fn.expand("<cword>")

	vim.cmd("normal! o")
	ls.snip_expand(s("snip_log", {
		t("console.log({ "),
		t(word),
		t(" });"),
	}))
end, { noremap = true, silent = true, desc = "Insert console.log with word under cursor" })
