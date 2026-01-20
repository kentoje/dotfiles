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
		t("console.log("),
		i(1),
		t(");"),
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
	s("snip_obj", {
		t("const "),
		i(1),
		t(" = {"),
		t({ "", "  " }),
		i(2),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("snip_type", {
		t("type "),
		i(1),
		t(" = {"),
		t({ "", "  " }),
		i(2),
		t({ "", "}" }),
	}),
})

ls.add_snippets("custom", {
	s("snip_reactcomp", {
		t("function "),
		i(1),
		t("({ "),
		i(2),
		t(" }: "),
		i(3),
		t(" ) "),
		t(" {"),
		t({ "", "  return (", "" }),
		t("    <"),
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

ls.add_snippets("custom", {
	s("snip_reactdefault", {
		t("export default function "),
		i(1),
		t("() {"),
		t({ "", "  return (" }),
		t({ "", "    <></>" }),
		t({ "", "  )" }),
		t({ "", "}" }),
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

vim.keymap.set("n", "<leader>sfc", function()
	trigger_snippet("custom", "snip_reactcomp")
end, { noremap = true, silent = true, desc = "Insert react component" })

vim.keymap.set("n", "<leader>sfd", function()
	trigger_snippet("custom", "snip_reactdefault")
end, { noremap = true, silent = true, desc = "Insert React default export component" })

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

vim.keymap.set("n", "<leader>sh", function()
	trigger_snippet("custom", "snip_htmltag")
end, { noremap = true, silent = true, desc = "Insert html tag" })

vim.keymap.set("n", "<leader>so", function()
	trigger_snippet("custom", "snip_obj")
end, { noremap = true, silent = true, desc = "Insert object" })

vim.keymap.set("n", "<leader>st", function()
	trigger_snippet("custom", "snip_type")
end, { noremap = true, silent = true, desc = "Insert object" })

vim.keymap.set("n", "<leader>sL", function()
	local word = vim.fn.expand("<cword>")

	vim.cmd("normal! o")
	ls.snip_expand(s("snip_log", {
		t("console.log({ "),
		t(word),
		t(" });"),
	}))
end, { noremap = true, silent = true, desc = "Insert console.log with word under cursor" })

vim.keymap.set("v", "<leader>sL", function()
	-- Use a more reliable method to get the selected text
	local mode = vim.fn.mode()

	if mode ~= "v" and mode ~= "V" and mode ~= "" then
		vim.cmd("normal! gv") -- Reselect the visual selection
	end

	-- Save the current register content
	local saved_reg = vim.fn.getreg('"')
	local saved_reg_type = vim.fn.getregtype('"')

	-- Yank the selected text
	vim.cmd("normal! y")
	local selected_text = vim.fn.getreg('"')

	-- Restore the register
	vim.fn.setreg('"', saved_reg, saved_reg_type)

	-- Move to the end of the selection and create a new line
	vim.cmd("normal! `>")
	vim.cmd("normal! o")

	-- Expand the snippet with the selected text
	ls.snip_expand(s("snip_log", {
		t("console.log({ "),
		t(selected_text),
		t(" });"),
	}))
end, { noremap = true, silent = true, desc = "Insert console.log with selected text" })

-- OpenProse Snippets (42 total)
-- Core Sessions (6)
ls.add_snippets("custom", {
	s("prose_session", {
		t('session "'),
		i(1, "prompt"),
		t('"'),
	}),
	s("prose_session_let", {
		t("let "),
		i(1, "name"),
		t(' = session "'),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_session_const", {
		t("const "),
		i(1, "name"),
		t(' = session "'),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_session_agent", {
		t("session: "),
		i(1, "agent"),
		t({ "", '  prompt: "' }),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_resume", {
		t("resume: "),
		i(1, "agent"),
		t({ "", '  prompt: "' }),
		i(2, "prompt"),
		t({ '"', "  context: " }),
		i(3, "ctx"),
	}),
	s("prose_session_seq", {
		t('session "'),
		i(1, "A"),
		t('" -> session "'),
		i(2, "B"),
		t('"'),
	}),
})

-- Agents (4)
ls.add_snippets("custom", {
	s("prose_agent", {
		t("agent "),
		i(1, "name"),
		t({ ":", "  model: " }),
		i(2, "sonnet"),
		t({ "", '  prompt: "' }),
		i(3, "prompt"),
		t('"'),
	}),
	s("prose_agent_persist", {
		t("agent "),
		i(1, "name"),
		t({ ":", "  model: opus", "  persist: true", '  prompt: "' }),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_agent_skills", {
		t("agent "),
		i(1, "name"),
		t({ ":", "  model: sonnet", '  skills: ["' }),
		i(2, "skill"),
		t({ '"]', '  prompt: "' }),
		i(3, "prompt"),
		t('"'),
	}),
	s("prose_agent_perms", {
		t("agent "),
		i(1, "name"),
		t({ ":", "  model: sonnet", "  permissions:", '    - "' }),
		i(2, "permission"),
		t({ '"', '  prompt: "' }),
		i(3, "prompt"),
		t('"'),
	}),
})

-- Parallel (5)
ls.add_snippets("custom", {
	s("prose_parallel", {
		t({ "parallel:", "  " }),
		i(1, "a"),
		t(' = session "'),
		i(2, "Task A"),
		t({ '"', "  " }),
		i(3, "b"),
		t(' = session "'),
		i(4, "Task B"),
		t('"'),
	}),
	s("prose_parallel_first", {
		t({ 'parallel ("first"):', "  " }),
		i(1, "a"),
		t(' = session "'),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_parallel_any", {
		t({ 'parallel ("any"):', "  " }),
		i(1, "a"),
		t(' = session "'),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_parallel_continue", {
		t({ 'parallel (on-fail: "continue"):', "  " }),
		i(1, "a"),
		t(' = session "'),
		i(2, "prompt"),
		t('"'),
	}),
	s("prose_parallel_for", {
		t("parallel for "),
		i(1, "item"),
		t(" in "),
		i(2, "items"),
		t({ ":", '  session "' }),
		i(3, "Process"),
		t({ '"', "    context: " }),
		f(function(args)
			return args[1][1]
		end, { 1 }),
	}),
})

-- Loops (7)
ls.add_snippets("custom", {
	s("prose_loop", {
		t("loop until **"),
		i(1, "task complete"),
		t("** (max: "),
		i(2, "10"),
		t({ "):", '  session "' }),
		i(3, "Work on task"),
		t('"'),
	}),
	s("prose_loop_while", {
		t("loop while **"),
		i(1, "condition"),
		t("** (max: "),
		i(2, "10"),
		t({ "):", '  session "' }),
		i(3, "prompt"),
		t('"'),
	}),
	s("prose_loop_index", {
		t("loop until **"),
		i(1, "condition"),
		t("** as "),
		i(2, "i"),
		t(" (max: "),
		i(3, "10"),
		t({ "):", '  session "' }),
		i(4, "prompt"),
		t('"'),
	}),
	s("prose_repeat", {
		t("repeat "),
		i(1, "3"),
		t({ ":", '  session "' }),
		i(2, "Generate idea"),
		t('"'),
	}),
	s("prose_repeat_index", {
		t("repeat "),
		i(1, "3"),
		t(" as "),
		i(2, "i"),
		t({ ":", '  session "' }),
		i(3, "prompt"),
		t('"'),
	}),
	s("prose_for", {
		t("for "),
		i(1, "topic"),
		t(" in "),
		i(2, "items"),
		t({ ":", '  session "' }),
		i(3, "Research"),
		t({ '"', "    context: " }),
		f(function(args)
			return args[1][1]
		end, { 1 }),
	}),
	s("prose_for_index", {
		t("for "),
		i(1, "item"),
		t(", "),
		i(2, "i"),
		t(" in "),
		i(3, "items"),
		t({ ":", '  session "' }),
		i(4, "Process"),
		t({ '"', "    context: " }),
		f(function(args)
			return args[1][1]
		end, { 1 }),
	}),
})

-- Pipelines (4)
ls.add_snippets("custom", {
	s("prose_map", {
		i(1, "items"),
		t({ "", "  | map:", '      session "' }),
		i(2, "Transform"),
		t({ '"', "        context: item" }),
	}),
	s("prose_filter", {
		i(1, "items"),
		t({ "", "  | filter:", '      session "' }),
		i(2, "Keep? yes/no"),
		t({ '"', "        context: item" }),
	}),
	s("prose_reduce", {
		i(1, "items"),
		t({ "", "  | reduce(" }),
		i(2, "acc"),
		t(", "),
		i(3, "item"),
		t({ "):", '      session "' }),
		i(4, "Accumulate"),
		t('"'),
	}),
	s("prose_pmap", {
		i(1, "items"),
		t({ "", "  | pmap:", '      session "' }),
		i(2, "Transform"),
		t({ '"', "        context: item" }),
	}),
})

-- Error Handling (4)
ls.add_snippets("custom", {
	s("prose_try", {
		t({ "try:", '  session "' }),
		i(1, "Risky operation"),
		t({ '"', "catch as " }),
		i(2, "err"),
		t({ ":", '  session "' }),
		i(3, "Handle error"),
		t({ '"', "    context: " }),
		f(function(args)
			return args[1][1]
		end, { 2 }),
	}),
	s("prose_try_finally", {
		t({ "try:", '  session "' }),
		i(1, "operation"),
		t({ '"', "catch as " }),
		i(2, "err"),
		t({ ":", '  session "' }),
		i(3, "Handle error"),
		t({ '"', "finally:", '  session "' }),
		i(4, "Cleanup"),
		t('"'),
	}),
	s("prose_throw", {
		t('throw "'),
		i(1, "message"),
		t('"'),
	}),
	s("prose_retry", {
		t("retry: "),
		i(1, "3"),
		t({ "", "backoff: " }),
		i(2, "exponential"),
	}),
})

-- Conditionals (4)
ls.add_snippets("custom", {
	s("prose_if", {
		t("if **"),
		i(1, "has security issues"),
		t({ "**:", '  session "' }),
		i(2, "Fix security"),
		t('"'),
	}),
	s("prose_if_else", {
		t("if **"),
		i(1, "condition"),
		t({ "**:", '  session "' }),
		i(2, "action"),
		t({ '"', "else:", '  session "' }),
		i(3, "fallback"),
		t('"'),
	}),
	s("prose_if_elif", {
		t("if **"),
		i(1, "cond1"),
		t({ "**:", '  session "' }),
		i(2, "action1"),
		t({ '"', "elif **" }),
		i(3, "cond2"),
		t({ "**:", '  session "' }),
		i(4, "action2"),
		t({ '"', "else:", '  session "' }),
		i(5, "fallback"),
		t('"'),
	}),
	s("prose_choice", {
		t("choice **"),
		i(1, "the severity level"),
		t({ "**:", '  option "' }),
		i(2, "Critical"),
		t({ '":', '    session "' }),
		i(3, "Escalate immediately"),
		t({ '"', '  option "' }),
		i(4, "Minor"),
		t({ '":', '    session "' }),
		i(5, "Log for later"),
		t('"'),
	}),
})

-- Blocks (3)
ls.add_snippets("custom", {
	s("prose_block", {
		t("block "),
		i(1, "review"),
		t("("),
		i(2, "topic"),
		t({ "):", '  session "' }),
		i(3, "Research "),
		f(function(args)
			return args[1][1]
		end, { 2 }),
		t('"'),
	}),
	s("prose_do", {
		t({ "do:", '  session "' }),
		i(1, "prompt"),
		t('"'),
	}),
	s("prose_do_invoke", {
		t("do "),
		i(1, "review"),
		t("("),
		i(2, "arg"),
		t(")"),
	}),
})

-- Program Structure (7)
ls.add_snippets("custom", {
	s("prose_use", {
		t('use "@'),
		i(1, "handle"),
		t("/"),
		i(2, "slug"),
		t('" as '),
		i(3, "name"),
	}),
	s("prose_input", {
		t("input "),
		i(1, "topic"),
		t(': "'),
		i(2, "The subject to research"),
		t('"'),
	}),
	s("prose_output", {
		t("output "),
		i(1, "findings"),
		t(' = session "'),
		i(2, "Synthesize research"),
		t({ '"', "  context: " }),
		i(3, "raw"),
	}),
	s("prose_invoke", {
		i(1, "program"),
		t("("),
		i(2, "input"),
		t(": "),
		i(3, "value"),
		t(")"),
	}),
	s("prose_context", {
		t("context: { "),
		i(1, "a"),
		t(", "),
		i(2, "b"),
		t(" }"),
	}),
	s("prose_multiline", {
		t({ '"""', "" }),
		i(1, "multi-line"),
		t({ "", "" }),
		i(2, "string"),
		t({ "", '"""' }),
	}),
	s("prose_comment", {
		t("# "),
		i(1, "comment"),
	}),
})

-- OpenProse Keymaps
-- Core Sessions
vim.keymap.set("n", "<leader>xos", function()
	trigger_snippet("custom", "prose_session")
end, { noremap = true, silent = true, desc = "OpenProse: session" })

vim.keymap.set("n", "<leader>xosl", function()
	trigger_snippet("custom", "prose_session_let")
end, { noremap = true, silent = true, desc = "OpenProse: let session" })

vim.keymap.set("n", "<leader>xosc", function()
	trigger_snippet("custom", "prose_session_const")
end, { noremap = true, silent = true, desc = "OpenProse: const session" })

vim.keymap.set("n", "<leader>xosa", function()
	trigger_snippet("custom", "prose_session_agent")
end, { noremap = true, silent = true, desc = "OpenProse: session with agent" })

vim.keymap.set("n", "<leader>xor", function()
	trigger_snippet("custom", "prose_resume")
end, { noremap = true, silent = true, desc = "OpenProse: resume" })

vim.keymap.set("n", "<leader>xosq", function()
	trigger_snippet("custom", "prose_session_seq")
end, { noremap = true, silent = true, desc = "OpenProse: session sequence" })

-- Agents
vim.keymap.set("n", "<leader>xoa", function()
	trigger_snippet("custom", "prose_agent")
end, { noremap = true, silent = true, desc = "OpenProse: agent" })

vim.keymap.set("n", "<leader>xoap", function()
	trigger_snippet("custom", "prose_agent_persist")
end, { noremap = true, silent = true, desc = "OpenProse: agent persist" })

vim.keymap.set("n", "<leader>xoas", function()
	trigger_snippet("custom", "prose_agent_skills")
end, { noremap = true, silent = true, desc = "OpenProse: agent with skills" })

vim.keymap.set("n", "<leader>xoape", function()
	trigger_snippet("custom", "prose_agent_perms")
end, { noremap = true, silent = true, desc = "OpenProse: agent with permissions" })

-- Parallel
vim.keymap.set("n", "<leader>xop", function()
	trigger_snippet("custom", "prose_parallel")
end, { noremap = true, silent = true, desc = "OpenProse: parallel" })

vim.keymap.set("n", "<leader>xopf", function()
	trigger_snippet("custom", "prose_parallel_first")
end, { noremap = true, silent = true, desc = "OpenProse: parallel first" })

vim.keymap.set("n", "<leader>xopa", function()
	trigger_snippet("custom", "prose_parallel_any")
end, { noremap = true, silent = true, desc = "OpenProse: parallel any" })

vim.keymap.set("n", "<leader>xopc", function()
	trigger_snippet("custom", "prose_parallel_continue")
end, { noremap = true, silent = true, desc = "OpenProse: parallel continue" })

vim.keymap.set("n", "<leader>xopfo", function()
	trigger_snippet("custom", "prose_parallel_for")
end, { noremap = true, silent = true, desc = "OpenProse: parallel for" })

-- Loops
vim.keymap.set("n", "<leader>xol", function()
	trigger_snippet("custom", "prose_loop")
end, { noremap = true, silent = true, desc = "OpenProse: loop until" })

vim.keymap.set("n", "<leader>xolw", function()
	trigger_snippet("custom", "prose_loop_while")
end, { noremap = true, silent = true, desc = "OpenProse: loop while" })

vim.keymap.set("n", "<leader>xoli", function()
	trigger_snippet("custom", "prose_loop_index")
end, { noremap = true, silent = true, desc = "OpenProse: loop with index" })

vim.keymap.set("n", "<leader>xore", function()
	trigger_snippet("custom", "prose_repeat")
end, { noremap = true, silent = true, desc = "OpenProse: repeat" })

vim.keymap.set("n", "<leader>xori", function()
	trigger_snippet("custom", "prose_repeat_index")
end, { noremap = true, silent = true, desc = "OpenProse: repeat with index" })

vim.keymap.set("n", "<leader>xof", function()
	trigger_snippet("custom", "prose_for")
end, { noremap = true, silent = true, desc = "OpenProse: for loop" })

vim.keymap.set("n", "<leader>xofi", function()
	trigger_snippet("custom", "prose_for_index")
end, { noremap = true, silent = true, desc = "OpenProse: for loop with index" })

-- Pipelines
vim.keymap.set("n", "<leader>xom", function()
	trigger_snippet("custom", "prose_map")
end, { noremap = true, silent = true, desc = "OpenProse: map" })

vim.keymap.set("n", "<leader>xofl", function()
	trigger_snippet("custom", "prose_filter")
end, { noremap = true, silent = true, desc = "OpenProse: filter" })

vim.keymap.set("n", "<leader>xord", function()
	trigger_snippet("custom", "prose_reduce")
end, { noremap = true, silent = true, desc = "OpenProse: reduce" })

vim.keymap.set("n", "<leader>xopm", function()
	trigger_snippet("custom", "prose_pmap")
end, { noremap = true, silent = true, desc = "OpenProse: pmap" })

-- Error Handling
vim.keymap.set("n", "<leader>xot", function()
	trigger_snippet("custom", "prose_try")
end, { noremap = true, silent = true, desc = "OpenProse: try-catch" })

vim.keymap.set("n", "<leader>xotf", function()
	trigger_snippet("custom", "prose_try_finally")
end, { noremap = true, silent = true, desc = "OpenProse: try-catch-finally" })

vim.keymap.set("n", "<leader>xoth", function()
	trigger_snippet("custom", "prose_throw")
end, { noremap = true, silent = true, desc = "OpenProse: throw" })

vim.keymap.set("n", "<leader>xoret", function()
	trigger_snippet("custom", "prose_retry")
end, { noremap = true, silent = true, desc = "OpenProse: retry" })

-- Conditionals
vim.keymap.set("n", "<leader>xoi", function()
	trigger_snippet("custom", "prose_if")
end, { noremap = true, silent = true, desc = "OpenProse: if" })

vim.keymap.set("n", "<leader>xoie", function()
	trigger_snippet("custom", "prose_if_else")
end, { noremap = true, silent = true, desc = "OpenProse: if-else" })

vim.keymap.set("n", "<leader>xoiei", function()
	trigger_snippet("custom", "prose_if_elif")
end, { noremap = true, silent = true, desc = "OpenProse: if-elif-else" })

vim.keymap.set("n", "<leader>xoc", function()
	trigger_snippet("custom", "prose_choice")
end, { noremap = true, silent = true, desc = "OpenProse: choice" })

-- Blocks
vim.keymap.set("n", "<leader>xob", function()
	trigger_snippet("custom", "prose_block")
end, { noremap = true, silent = true, desc = "OpenProse: block" })

vim.keymap.set("n", "<leader>xod", function()
	trigger_snippet("custom", "prose_do")
end, { noremap = true, silent = true, desc = "OpenProse: do" })

vim.keymap.set("n", "<leader>xodi", function()
	trigger_snippet("custom", "prose_do_invoke")
end, { noremap = true, silent = true, desc = "OpenProse: do invoke" })

-- Program Structure
vim.keymap.set("n", "<leader>xou", function()
	trigger_snippet("custom", "prose_use")
end, { noremap = true, silent = true, desc = "OpenProse: use" })

vim.keymap.set("n", "<leader>xoin", function()
	trigger_snippet("custom", "prose_input")
end, { noremap = true, silent = true, desc = "OpenProse: input" })

vim.keymap.set("n", "<leader>xoo", function()
	trigger_snippet("custom", "prose_output")
end, { noremap = true, silent = true, desc = "OpenProse: output" })

vim.keymap.set("n", "<leader>xoiv", function()
	trigger_snippet("custom", "prose_invoke")
end, { noremap = true, silent = true, desc = "OpenProse: invoke program" })

vim.keymap.set("n", "<leader>xoctx", function()
	trigger_snippet("custom", "prose_context")
end, { noremap = true, silent = true, desc = "OpenProse: context" })

vim.keymap.set("n", "<leader>xoml", function()
	trigger_snippet("custom", "prose_multiline")
end, { noremap = true, silent = true, desc = "OpenProse: multiline string" })

vim.keymap.set("n", "<leader>xocc", function()
	trigger_snippet("custom", "prose_comment")
end, { noremap = true, silent = true, desc = "OpenProse: comment" })
