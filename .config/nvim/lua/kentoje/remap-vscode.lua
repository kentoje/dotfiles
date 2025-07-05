local vscode = require("vscode")

vim.g.mapleader = " "

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

-- vim.keymap.set({ "n" }, "<C-l>", function()
-- 	vscode.action("workbench.action.nextEditor")
-- end)
--
-- vim.keymap.set({ "n" }, "<C-h>", function()
-- 	vscode.action("workbench.action.previousEditor")
-- end)

vim.keymap.set({ "n" }, "<leader>l", function()
	vscode.action("workbench.action.moveEditorToNextGroup")
end)

vim.keymap.set({ "n" }, "<leader>h", function()
	vscode.action("workbench.action.moveEditorToPreviousGroup")
end)

vim.keymap.set({ "n" }, "<leader>d", function()
	vscode.action("workbench.action.splitEditor")
end)

vim.keymap.set({ "n" }, "<leader>i", function()
	vscode.action("composer.openChatAsEditor")
end)

-- vim.keymap.set({ "n" }, "<leader>e", function()
-- 	vscode.action("editor.action.formatDocument")
-- end)

vim.keymap.set({ "n" }, "<leader>e", function()
	vscode.action("eslint.executeAutofix")
end)

-- vim.keymap.set({ "n" }, "<leader>E", function()
-- 	vscode.action("editor.action.autoFix")
-- end)

vim.keymap.set({ "n", "x" }, "g.", function()
	vscode.with_insert(function()
		vscode.action("editor.action.quickFix")
	end)
end)

vim.keymap.set({ "n" }, "gd", function()
	vscode.action("editor.action.showHover")
end)

vim.keymap.set({ "n" }, "gf", function()
	vscode.action("editor.action.revealDefinition")
end)

vim.keymap.set({ "n" }, "gF", function()
	vscode.action("editor.action.referenceSearch.trigger")
end)

vim.keymap.set({ "n" }, "gp", function()
	vscode.action("workbench.action.quickOpen")
end)

-- vim.keymap.set({ "n" }, "<leader>fg", function()
-- 	vscode.action("workbench.action.findInFiles")
-- end)

vim.keymap.set({ "n" }, "<leader>fr", function()
	vscode.action("search.action.focusSearchList")
end)

vim.keymap.set({ "n" }, "<leader>fs", function()
	vscode.action("workbench.action.showAllSymbols")
end)

vim.keymap.set({ "n" }, "<leader>fg", function()
	vscode.action("workbench.action.quickTextSearch")
end)

vim.keymap.set({ "n" }, "<leader>cr", function()
	vscode.action("editor.action.rename")
end)

vim.keymap.set({ "n" }, "<leader>y", function()
	vscode.action("copyFilePath")
end)

vim.keymap.set({ "n" }, "]e", function()
	vscode.action("editor.action.marker.next")
end)

vim.keymap.set({ "n" }, "[e", function()
	vscode.action("editor.action.marker.prev")
end)

vim.keymap.set({ "n" }, "]c", function()
	vscode.action("editor.action.inlineDiffs.nextChange")
end)

vim.keymap.set({ "n" }, "[c", function()
	vscode.action("editor.action.inlineDiffs.previousChange")
end)

vim.keymap.set({ "n" }, "]f", function()
	vscode.action("editor.action.inlineDiffs.nextDiffFile")
end)

vim.keymap.set({ "n" }, "[f", function()
	vscode.action("editor.action.inlineDiffs.previousDiffFile")
end)

vim.keymap.set({ "n" }, "]d", function()
	vscode.action("editor.action.marker.next")
end)

vim.keymap.set({ "n" }, "[d", function()
	vscode.action("editor.action.marker.prev")
end)

vim.keymap.set({ "n", "x" }, "]]", "*")
vim.keymap.set({ "n", "x" }, "[[", "#")

-- Plugins
vim.keymap.set({ "n" }, "<leader>xgb", function()
	vscode.action("gitlens.toggleFileBlame")
end)

vim.keymap.set({ "n" }, "<leader>a", function()
	vscode.action("harpoon.add")
end)

vim.keymap.set({ "n" }, "<leader>1", function()
	vscode.action("harpoon.yoink", { args = { 0 } })
end)

vim.keymap.set({ "n" }, "<leader>2", function()
	vscode.action("harpoon.yoink", { args = { 1 } })
end)

vim.keymap.set({ "n" }, "<leader>3", function()
	vscode.action("harpoon.yoink", { args = { 2 } })
end)

vim.keymap.set({ "n" }, "<leader><leader>", function()
	vscode.action("harpoon.show")
end)
