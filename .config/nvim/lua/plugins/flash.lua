return {
	"folke/flash.nvim",
	enabled = false,
	event = "VeryLazy",
	---@type Flash.Config
	opts = {},
  -- stylua: ignore
  keys = {
    { "<leader>/", mode = { "n", "x", "o" }, function() require("flash").jump() end, desc = "Flash" },
  },
}
