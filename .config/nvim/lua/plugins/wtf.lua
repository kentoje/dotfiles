return {
	"piersolenski/wtf.nvim",
	dependencies = {
		"MunifTanjim/nui.nvim",
	},
	config = function()
		-- local home = vim.fn.expand("$HOME")
		--
		-- local process = io.popen("gpg -d -q " .. home .. "/.gnupg/.secrets/openai-api-key.txt.gpg")
		-- if not process then
		-- 	print("Wtf: gpg process is nil")
		-- 	return
		-- end
		--
		-- local output = process:read("*a")
		-- local trimmed = string.gsub(output, "%s+", "")
		-- process:close()

		require("wtf").setup({
			popup_type = "vertical",
			-- openai_api_key = trimmed,
			openai_model_id = "gpt-4",
		})
	end,
}
