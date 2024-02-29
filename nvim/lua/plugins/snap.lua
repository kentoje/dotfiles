return {
	"camspiers/snap",
	enabled = false,
	config = function()
		local snap = require("snap")
		local vimgrep = snap.config.vimgrep:with({
			limit = 50000,
		})

		-- snap.run({
		-- 	producer = snap.get("consumer.fzf")(snap.get("producer.ripgrep.file")),
		-- 	select = snap.get("select.file").select,
		-- 	multiselect = snap.get("select.file").multiselect,
		-- 	views = { snap.get("preview.file") },
		-- })
		snap.maps({
			-- { "<leader>qp", snap.config.file({ producer = "ripgrep.file" }) },
			{
				"<leader>qp",
				snap.config.file({
					producer = snap.get("consumer.fzf")(
						snap.get("consumer.try")(snap.get("producer.git.file"), snap.get("producer.ripgrep.file"))
					),
				}),
			},

			-- {
			-- 	"<leader>qp",
			-- 	snap.config.file({
			-- 		producer = "ripgrep.file",
			-- 		args = {
			-- 			"--files",
			-- 			"--no-ignore",
			-- 			"--hidden",
			-- 			"-g",
			-- 			"!node_modules/*",
			-- 			"-g",
			-- 			"!.yarn",
			-- 			"-g",
			-- 			"!.git/logs",
			-- 			"-g",
			-- 			"!type-docs",
			-- 			"-g",
			-- 			"!build",
			-- 			"-g",
			-- 			"!local-build",
			-- 			"-g",
			-- 			"!storybook-static",
			-- 			"-g",
			-- 			"!coverage/*",
			-- 		},
			-- 	}),
			-- },

			-- { "<leader>qp", snap.config.file({ try = { "git.file", "rigrep.file" } }) },
			{ "<leader>fb", snap.config.file({ producer = "vim.buffer" }) },
			{
				"<leader>fg",
				vimgrep({}),
			},
		})
	end,
}
