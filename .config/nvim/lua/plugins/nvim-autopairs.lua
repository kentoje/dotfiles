return {
	"windwp/nvim-autopairs",
	event = "InsertEnter",
	enabled = false,
	config = function()
		require("nvim-autopairs").setup({
			-- disable_filetype = { "TelescopePrompt", "guihua", "guihua_rust", "clap_input" },
		})
	end,
}
