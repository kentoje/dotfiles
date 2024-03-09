# dotfiles

## Install

### Stow

Run stow in the current dotfiles directory which should be in `$HOME/dotfiles`

```
$ sudo ./setup/macos/setup.sh
$ stow .
```

### Tmux

Install tmux plugins

```
$ nvim .config/tmux/tmux.config
```

Run plugin install with: `<C-TMUX_PREFIX>I`
