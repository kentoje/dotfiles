# dotfiles

## Screenshots

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/a196dd6e-398c-46a4-8c6e-606b878d9d30" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/4a863c6f-eb55-440d-89cc-957c26378fed" />


## Flow

Nix is in charge of managing the system configuration. The dotfiles are managed by stow and are symlinked to the home directory.

Homebrew is installed via Nix, and most of UI applications are installed if possible with Nix.

## Install

### Stow

Run stow in the current dotfiles directory which should be in `$HOME/dotfiles`

```bash
$ sudo ./setup/macos/setup.sh
```

### nix-darwin

Install nix

```bash
$ curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

Install nix-darwin

```bash
$ nix run nix-darwin -- switch --flake ./.config/nix-darwin-<PRO_OR_MINI>#kento
```

Update nix packages

```bash
$ nix flake update ./.config/nix-darwin-pro
```

Rebuild env

```bash
$ darwin-rebuild switch --flake <PATH_TO_FLAKE>#<HOSTNAME>
```

### Tmux

Install tmux plugins

```bash
$ git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
$ nvim .config/tmux/tmux.config
```

Run plugin install with: `<C-TMUX_PREFIX>I`
