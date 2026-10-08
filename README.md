# dotfiles

## Screenshots

<img width="1920" height="1080" alt="SCR-20260627-ugeq" src="https://github.com/user-attachments/assets/40712719-8f65-4886-9d37-455fdf54e627" />


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
$ nix run nix-darwin -- switch --flake ./.config/nix-darwin#<mac-mini_OR_macbook-pro>
```

Update nix packages

```bash
$ nix flake update ./.config/nix-darwin
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

### pi custom harness

The `pih` abbr runs pi against `.pi-custom-harness`, whose extensions import `effect`.
The lockfile is committed but `node_modules` is gitignored, so a fresh clone must install the deps or pi refuses to boot with `Cannot find module 'effect'`.

`setup/macos/setup.sh` does this for you; to run it on its own:

```bash
$ ./setup/macos/setup_pi_harness_deps.sh
```

### Pi agent status

Pi's settings load `.pi/agent/extensions/agent-gossips/index.ts` for agent-gossip and SketchyBar.
It reports interactive sessions only, keeps working status until `agent_settled`, and refreshes every 15 seconds so idle agents reappear after the gossip server restarts.
Namespaced startup events preserve multiple live agents in the same directory.

Install Herdr's separately managed Pi integration on each machine:

```bash
herdr integration install pi
herdr integration status
```

Run `/reload` in each existing Pi session after installing or changing these integrations.
No agent or Herdr server restart is needed.

Run the gossip reporter's regression tests with:

```bash
bun test ./.pi/agent/extensions/agent-gossips/agent-gossips.test.js
```
