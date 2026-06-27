-- <C-h/j/k/l> seamless navigation across Neovim splits AND herdr panes, via the
-- vim-herdr-navigation plugin (herdr side bound in ~/.config/herdr/config.toml).
-- vim-tmux-navigator stays installed only for its :TmuxNavigate* commands, which
-- the herdr-nav module uses as the tmux fallback when not inside a herdr pane.
return {
	"christoomey/vim-tmux-navigator",
	lazy = false,
	init = function()
		-- Disable vim-tmux-navigator's own <C-h/j/k/l> maps; the herdr-nav
		-- module below owns them (single source of truth).
		vim.g.tmux_navigator_no_mappings = 1
		vim.g.tmux_navigator_save_on_switch = 1
	end,
	config = function()
		-- Sets the <C-h/j/k/l> maps: move between nvim splits, and at a split
		-- edge hand off to herdr (HERDR_PANE_ID) → tmux ($TMUX) → plain wincmd.
		dofile(vim.fn.expand("~/Documents/github/vim-herdr-navigation/editor/nvim.lua"))
	end,
}
