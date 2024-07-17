local alpha = function()
	return string.format("%x", math.floor(255 * vim.g.transparency or 0.9))
end

vim.o.guifont = "SFMono Nerd Font:h14"
vim.opt.linespace = 2

vim.g.neovide_refresh_rate = 144

vim.g.neovide_padding_top = 8
vim.g.neovide_padding_bottom = 8
vim.g.neovide_padding_right = 8
vim.g.neovide_padding_left = 8

-- g:neovide_transparency should be 0 if you want to unify transparency of content and title bar.
vim.g.neovide_transparency = 0.0
vim.g.transparency = 0.85
vim.g.neovide_background_color = "#313244" .. alpha()
-- vim.g.neovide_show_border = true

-- vim.g.neovide_floating_blur_amount_x = 2.0
-- vim.g.neovide_floating_blur_amount_y = 2.0

vim.g.neovide_scroll_animation_length = 0.05

vim.g.neovide_cursor_animation_length = 0.05
-- vim.g.neovide_cursor_trail_size = 1
vim.g.neovide_cursor_vfx_particle_density = 30
vim.g.neovide_cursor_vfx_particle_lifetime = 1.6

vim.g.neovide_cursor_vfx_mode = "pixiedust"
