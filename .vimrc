syntax on

set tabstop=4 softtabstop=4
set backspace=indent,eol,start
set shiftwidth=4
set expandtab
set smartindent
set nu
set nowrap
set smartcase
set noswapfile
set nobackup
set undodir=~/.vim/undodir
set undofile
set incsearch
set colorcolumn=80
set belloff=all

call plug#begin('~/.vim/plugged')
Plug 'connorholyday/vim-snazzy'
call plug#end()

