local status, null_ls = pcall(require, 'null-ls')

if (not status) then return end

null_ls.setup {
  sources = {
    require("null-ls").builtins.formatting.prettierd,
    require("null-ls").builtins.completion.spell,
  },

  on_attach = function(client, bufnr)
    if client.server_capabilities.documentFormattingProvider then
      -- vim.cmd("nnoremap <silent><buffer> <Leader>d :lua vim.lsp.buf.format()<CR>")

      -- format on save
      -- vim.cmd("autocmd BufWritePre <buffer> lua vim.lsp.buf.format()")
      vim.api.nvim_command [[augroup Format]]
      vim.api.nvim_command [[autocmd! * <buffer>]]
      vim.api.nvim_command [[autocmd BufWritePre <buffer> lua vim.lsp.buf.formatting_seq_sync()]]
      -- vim.api.nvim_command [[autocmd BufWritePre *.tsx,*.ts,*.jsx,*.js EslintFixAll]]
      vim.api.nvim_command [[augroup END]]

    end

    -- if client.server_capabilities.documentRangeFormattingProvider then
    -- vim.cmd("xnoremap <silent><buffer> <Leader>d :lua vim.lsp.buf.range_formatting({})<CR>")
    -- end
  end,
}
