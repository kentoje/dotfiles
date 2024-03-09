return {
	"echasnovski/mini.nvim",
	config = function()
		local mini_files = require("mini.files")
		-- local mini_animate = require("mini.animate")

		mini_files.setup({
			mappings = {
				close = "<ESC>",
			},
		})
		-- mini_animate.setup({
		-- 	-- Cursor path
		-- 	cursor = {
		-- 		-- Whether to enable this animation
		-- 		enable = true,
		--
		-- 		-- Timing of animation (how steps will progress in time)
		-- 		timing = mini_animate.gen_timing.linear({ duration = 100, unit = "total" }),
		--
		-- 		-- Path generator for visualized cursor movement
		-- 		-- path = --<function: implements shortest line path>,
		-- 	},
		--
		-- 	-- Vertical scroll
		-- 	scroll = {
		-- 		-- Whether to enable this animation
		-- 		enable = false,
		--
		-- 		-- Timing of animation (how steps will progress in time)
		-- 		timing = mini_animate.gen_timing.linear({ duration = 50, unit = "total" }),
		--
		-- 		-- Subscroll generator based on total scroll
		-- 		-- subscroll = --<function: implements equal scroll with at most 60 steps>,
		-- 	},
		--
		-- 	-- Window resize
		-- 	resize = {
		-- 		-- Whether to enable this animation
		-- 		enable = false,
		--
		-- 		-- Timing of animation (how steps will progress in time)
		-- 		-- timing = --<function: implements linear total 250ms animation duration>,
		--
		-- 		-- Subresize generator for all steps of resize animations
		-- 		-- subresize = --<function: implements equal linear steps>,
		-- 	},
		--
		-- 	-- Window open
		-- 	open = {
		-- 		-- Whether to enable this animation
		-- 		enable = false,
		--
		-- 		-- Timing of animation (how steps will progress in time)
		-- 		-- timing = --<function: implements linear total 250ms animation duration>,
		--
		-- 		-- Floating window config generator visualizing specific window
		-- 		-- winconfig = --<function: implements static window for 25 steps>,
		--
		-- 		-- 'winblend' (window transparency) generator for floating window
		-- 		-- winblend = --<function: implements equal linear steps from 80 to 100>,
		-- 	},
		--
		-- 	-- Window close
		-- 	close = {
		-- 		-- Whether to enable this animation
		-- 		enable = false,
		--
		-- 		-- Timing of animation (how steps will progress in time)
		-- 		-- timing = --<function: implements linear total 250ms animation duration>,
		--
		-- 		-- Floating window config generator visualizing specific window
		-- 		-- winconfig = --<function: implements static window for 25 steps>,
		--
		-- 		-- 'winblend' (window transparency) generator for floating window
		-- 		-- winblend = --<function: implements equal linear steps from 80 to 100>,
		-- 	},
		-- })
		-- require("mini.pairs").setup()
		vim.keymap.set("n", "<leader>-", function()
			-- minifiles.open(vim.api.nvim_buf_get_name(0), false) -- cwd with new state
			mini_files.open(vim.api.nvim_buf_get_name(0)) -- cwd but same state
		end, { noremap = true })
	end,
}
