require("Comment").setup()

local ft = require("Comment.ft")
local api = require("Comment.api")
ft.set("json", "//%s")

vim.keymap.set(
	"n",
	"<M-/>",
	api.call("toggle.linewise.current", "g@$"),
	{ expr = true, desc = "Comment the current line" }
)
