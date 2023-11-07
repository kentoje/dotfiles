require("ts_context_commentstring").setup({})
require("Comment").setup({
	pre_hook = require("ts_context_commentstring.integrations.comment_nvim").create_pre_hook(),
})

local ft = require("Comment.ft")
local api = require("Comment.api")
ft.set("json", "//%s")

vim.keymap.set(
	"n",
	"<M-/>",
	api.call("toggle.linewise.current", "g@$"),
	{ expr = true, desc = "Comment the current line" }
)
