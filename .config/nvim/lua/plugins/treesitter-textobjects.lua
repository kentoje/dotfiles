return {
	"nvim-treesitter/nvim-treesitter-textobjects",
	branch = "main",
	dependencies = {
		"nvim-treesitter/nvim-treesitter",
	},
	config = function()
		local ts_repeat_move = require("nvim-treesitter-textobjects.repeatable_move")
		local ts_select = require("nvim-treesitter-textobjects.select")
		local ts_move = require("nvim-treesitter-textobjects.move")

		require("nvim-treesitter-textobjects").setup({
			move = {
				set_jumps = true,
			},
			select = {
				lookahead = true,
				selection_modes = {
					["@parameter.outer"] = "v",
					["@function.outer"] = "V",
					["@class.outer"] = "<c-v>",
				},
				include_surrounding_whitespace = false,
			},
		})

		vim.keymap.set({ "n", "x", "o" }, ";", ts_repeat_move.repeat_last_move_next)
		vim.keymap.set({ "n", "x", "o" }, ",", ts_repeat_move.repeat_last_move_previous)
		vim.keymap.set({ "n", "x", "o" }, "f", ts_repeat_move.builtin_f_expr, { expr = true })
		vim.keymap.set({ "n", "x", "o" }, "F", ts_repeat_move.builtin_F_expr, { expr = true })
		vim.keymap.set({ "n", "x", "o" }, "t", ts_repeat_move.builtin_t_expr, { expr = true })
		vim.keymap.set({ "n", "x", "o" }, "T", ts_repeat_move.builtin_T_expr, { expr = true })

		vim.keymap.set({ "x", "o" }, "af", function()
			ts_select.select_textobject("@function.outer", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "if", function()
			ts_select.select_textobject("@function.inner", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "ai", function()
			ts_select.select_textobject("@conditional.outer", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "ii", function()
			ts_select.select_textobject("@conditional.inner", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "al", function()
			ts_select.select_textobject("@loop.outer", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "il", function()
			ts_select.select_textobject("@loop.inner", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "it", function()
			ts_select.select_textobject("@comment.inner", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "at", function()
			ts_select.select_textobject("@comment.outer", "textobjects")
		end)
		vim.keymap.set({ "x", "o" }, "as", function()
			ts_select.select_textobject("@scope", "locals")
		end)

		vim.keymap.set({ "n", "x", "o" }, "]f", function()
			ts_move.goto_next_start("@function.outer", "textobjects")
		end)
		vim.keymap.set({ "n", "x", "o" }, "]i", function()
			ts_move.goto_next_start("@conditional.outer", "textobjects")
		end)
		vim.keymap.set({ "n", "x", "o" }, "[f", function()
			ts_move.goto_previous_start("@function.outer", "textobjects")
		end)
		vim.keymap.set({ "n", "x", "o" }, "[i", function()
			ts_move.goto_previous_start("@conditional.outer", "textobjects")
		end)
	end,
}
