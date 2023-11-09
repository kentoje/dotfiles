return {
	"ruifm/gitlinker.nvim",
	dependencies = "nvim-lua/plenary.nvim",
	config = function()
		require("gitlinker").setup({
			callbacks = {
				["github.com"] = require("gitlinker.hosts").get_github_type_url,
				["gitlab.com"] = require("gitlinker.hosts").get_gitlab_type_url,
				["try.gitea.io"] = require("gitlinker.hosts").get_gitea_type_url,
				["codeberg.org"] = require("gitlinker.hosts").get_gitea_type_url,
				["bitbucket.org"] = require("gitlinker.hosts").get_bitbucket_type_url,
				["try.gogs.io"] = require("gitlinker.hosts").get_gogs_type_url,
				["git.sr.ht"] = require("gitlinker.hosts").get_srht_type_url,
				["git.launchpad.net"] = require("gitlinker.hosts").get_launchpad_type_url,
				["repo.or.cz"] = require("gitlinker.hosts").get_repoorcz_type_url,
				["git.kernel.org"] = require("gitlinker.hosts").get_cgit_type_url,
				["git.savannah.gnu.org"] = require("gitlinker.hosts").get_cgit_type_url,
			},
			-- default mapping to call url generation with action_callback
			mappings = "<leader>xs",
		})
	end,
}
