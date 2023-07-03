if vim.g.vscode then
    -- VSCode extension
  require("kentoje.remap-vscode")
else
    -- ordinary Neovim
  require("kentoje.remap")
  require("kentoje.set")
end

