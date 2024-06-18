return {
	"nvimdev/guard.nvim",
	-- Builtin configuration, optional
	dependencies = {
		"nvimdev/guard-collection",
	},
	enabled = false,
	config = function()
		local ft = require("guard.filetype")
		local eslint_d = {
			cmd = "/Users/kento/.local/share/nvim/mason/bin/eslint_d",
			-- maybe --fix to stdout is a problem on error?
			args = { "--fix-to-stdout", "--stdin", "--stdin-filename" },
			fname = true,
			stdin = true,
			ignore_error = false,
		}
		local prettierd = {
			cmd = "/Users/kento/.local/share/nvim/mason/bin/prettierd",
			args = { "--stdin-filepath" },
			fname = true,
			stdin = true,
		}

		-- Assuming you have guard-collection
		-- ft("lang"):fmt("format-tool-1"):append("format-tool-2"):env(env_table):lint("lint-tool-1"):extra(extra_args)
		-- ft("typescript,javascript,typescriptreact"):fmt("eslint"):append("prettier")

		-- ft("typescript,javascript,typescriptreact,json"):fmt(eslint_d):append(prettierd)
		-- ft("typescript,javascript,typescriptreact,json"):fmt(prettierd):append(eslint_d)
		ft("typescript,javascript,typescriptreact,json"):fmt(prettierd)

		-- ft("typescript,javascript,typescriptreact,json"):fmt(prettierd)
		ft("graphql,html,css,markdown,yaml"):fmt(prettierd)
		ft("lua"):fmt("stylua")

		-- Call setup() LAST!
		require("guard").setup({
			fmt_on_save = true,
			lsp_as_default_formatter = true,
		})
	end,
}
