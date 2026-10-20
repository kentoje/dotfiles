# Dev MicroVM image (AWS Lambda MicroVMs, linux/arm64).
# Built by `mvm image build`: Lambda runs this Dockerfile on its AL2023 base MicroVM, starts
# CMD, waits for the /ready hook, then snapshots disk and memory.
#
# No secrets at build time. Secrets arrive at /run from Secrets Manager through the execution
# role (see /opt/mvm/bin/mvm-write-dev-env). Repos and node_modules are fetched at /run by the
# background workspace bootstrap (/opt/mvm/bin/mvm-bootstrap-workspace).
#
# Tool versions are pinned here on purpose: bump them deliberately, then `mvm image build`.
FROM public.ecr.aws/ubuntu/ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG AWSCLI_URL=https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip
ARG WEBSOCAT_VERSION=1.14.1
ARG GLAB_VERSION=1.122.0
ARG AGENT_BROWSER_VERSION=0.39.0
ARG NODE_VERSION=24.15.0
ARG BUN_VERSION=1.4.3
ARG PI_VERSION=1.2.0
ARG PORTLESS_VERSION=0.15.7
ARG OMP_VERSION=18.10.3
ARG HERDR_VERSION=0.9.5
ARG CODEX_VERSION=0.162.1
ARG JIRA_CLI_VERSION=1.7.0
ARG NVIM_VERSION=0.12.6
ARG LAZYGIT_VERSION=0.66.1
ARG YAZI_VERSION=26.9.1
ARG TREE_SITTER_VERSION=0.27.1
# conversation-center-ext's @playwright/test; its Chromium is pre-downloaded below.
ARG PLAYWRIGHT_VERSION=1.50.1

# --- System packages ---------------------------------------------------------------------------
# libnss-myhostname + nsswitch: Lambda mounts an empty, read-only /etc/hosts, so the machine's own
# hostname (set by mvm-on-run) resolves through nss myhostname instead.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git git-lfs jq openssh-server openssh-client sudo tini libnss-myhostname \
      locales tzdata python3 python3-venv python3-pip pipx \
      build-essential pkg-config libssl-dev \
      unzip zip xz-utils bzip2 file less vim-tiny man-db \
      tmux htop btop ripgrep fd-find fzf zoxide git-delta tree ncdu rsync socat netcat-openbsd lsof zstd \
      iproute2 iputils-ping dnsutils procps psmisc sqlite3 \
      gh golang-go imagemagick ffmpeg \
      fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
 && ln -sf /usr/bin/fdfind /usr/local/bin/fd \
 && sed -i -E 's/^hosts:.*/hosts:          files myhostname dns/' /etc/nsswitch.conf \
 && sed -i 's/^# *en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen \
 && rm -rf /var/lib/apt/lists/*
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# AWS CLI v2: secrets at /run, AppSync schema downloads.
RUN curl -fsSL "$AWSCLI_URL" -o /tmp/awscli.zip \
 && unzip -q /tmp/awscli.zip -d /tmp \
 && /tmp/aws/install \
 && rm -rf /tmp/aws /tmp/awscli.zip

# websocat: the WebSocket-to-sshd bridge behind the MicroVM endpoint.
RUN curl -fsSL -o /usr/local/bin/websocat \
      "https://github.com/vi/websocat/releases/download/v${WEBSOCAT_VERSION}/websocat.aarch64-unknown-linux-musl" \
 && chmod 755 /usr/local/bin/websocat

# glab (GitLab CLI). Reads GITLAB_TOKEN from the env, so it needs no config file.
RUN curl -fsSL -o /tmp/glab.deb \
      "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_linux_arm64.deb" \
 && apt-get install -y /tmp/glab.deb && rm -f /tmp/glab.deb

# agent-browser (native binary; finds the Playwright Chromium installed below).
RUN curl -fsSL -o /usr/local/bin/agent-browser \
      "https://github.com/vercel-labs/agent-browser/releases/download/v${AGENT_BROWSER_VERSION}/agent-browser-linux-arm64" \
 && chmod 755 /usr/local/bin/agent-browser

# --- dev user (uid 1000, locked account: login with ssh keys only) -------------------------------
# No sudo grant: Lambda starts PID 1 with no_new_privs, so sudo can never raise privileges on a
# MicroVM (it exits saying so). System packages and root setup belong in this Dockerfile.
RUN userdel -r ubuntu 2>/dev/null || true; \
    useradd -m -u 1000 -s /bin/bash dev \
 && usermod -p '*' dev \
 && rm -f /etc/ssh/ssh_host_*

USER dev
WORKDIR /home/dev
ENV HOME=/home/dev
RUN mkdir -p ~/.local/bin ~/.config ~/.cache ~/Documents/gitlab/aircall ~/Documents/github/kentoje

# Node via fnm (default alias, corepack picks each repo's pnpm version).
RUN curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$HOME/.local/share/fnm" --skip-shell \
 && export PATH="$HOME/.local/share/fnm:$PATH" \
 && eval "$(fnm env --shell bash)" \
 && fnm install "$NODE_VERSION" \
 && fnm default "$NODE_VERSION" \
 && export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH" \
 && corepack enable \
 && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@latest --activate \
 && node --version && pnpm --version

# bun (omp needs >= 1.3.14), then pi and portless as bun globals, like on boxd.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
 && export PATH="$HOME/.bun/bin:$HOME/.local/share/fnm/aliases/default/bin:$PATH" \
 && bun add -g "@earendil-works/pi-coding-agent@${PI_VERSION}" "portless@${PORTLESS_VERSION}" \
 && pi --version && portless --version

# Single-binary tools into ~/.local/bin.
RUN set -e; cd /tmp; \
    curl -fsSL -o ~/.local/bin/omp "https://github.com/can1357/oh-my-pi/releases/download/v${OMP_VERSION}/omp-linux-arm64"; \
    curl -fsSL -o ~/.local/bin/herdr "https://github.com/herdrdev/herdr/releases/download/v${HERDR_VERSION}/herdr-linux-aarch64"; \
    curl -fsSL "https://github.com/openai/codex/releases/download/rust-v${CODEX_VERSION}/codex-aarch64-unknown-linux-musl.tar.gz" | tar -xz -C /tmp; \
    mv /tmp/codex-aarch64-unknown-linux-musl ~/.local/bin/codex; \
    curl -fsSL "https://github.com/ankitpokhrel/jira-cli/releases/download/v${JIRA_CLI_VERSION}/jira_${JIRA_CLI_VERSION}_linux_arm64.tar.gz" | tar -xz -C /tmp; \
    mv "$(find /tmp -path '*jira_*' -type f -name jira | head -1)" ~/.local/bin/jira; \
    curl -fsSL "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_linux_arm64.tar.gz" | tar -xz -C ~/.local/bin lazygit; \
    curl -fsSL -o /tmp/yazi.zip "https://github.com/sxyazi/yazi/releases/download/v${YAZI_VERSION}/yazi-aarch64-unknown-linux-gnu.zip"; \
    unzip -q /tmp/yazi.zip -d /tmp/yazi && mv /tmp/yazi/*/yazi /tmp/yazi/*/ya ~/.local/bin/; \
    curl -fsSL "https://github.com/tree-sitter/tree-sitter/releases/download/v${TREE_SITTER_VERSION}/tree-sitter-linux-arm64.gz" | gunzip >~/.local/bin/tree-sitter; \
    curl -fsSL "https://github.com/neovim/neovim/releases/download/v${NVIM_VERSION}/nvim-linux-arm64.tar.gz" | tar -xz -C ~/.local; \
    mv ~/.local/nvim-linux-arm64 ~/.local/nvim && ln -sf ~/.local/nvim/bin/nvim ~/.local/bin/nvim; \
    chmod 755 ~/.local/bin/*; rm -rf /tmp/*; \
    for t in omp herdr codex lazygit yazi tree-sitter nvim; do printf '%s: ' "$t"; ~/.local/bin/$t --version 2>&1 | head -1 || true; done; \
    ~/.local/bin/jira version

# Claude Code, uv, and rust (for the herdr-vim-nav plugin).
RUN curl -fsSL https://claude.ai/install.sh | bash \
 && curl -LsSf https://astral.sh/uv/install.sh | env UV_NO_MODIFY_PATH=1 sh \
 && curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path \
 && ~/.local/bin/claude --version && ~/.local/bin/uv --version && ~/.cargo/bin/cargo --version

# Dotfiles (public) and the same links boxd's aircall-dev snapshot has.
RUN git clone --filter=blob:none https://github.com/kentoje/dotfiles.git ~/dotfiles \
 && ln -s ~/dotfiles/.agents ~/.agents \
 && mkdir -p ~/.pi/agent ~/.omp ~/.config/herdr \
 && for f in AGENTS.md extensions keybindings.json mcp.json models.json settings.json themes; do \
      if [ -e ~/dotfiles/.pi/agent/$f ]; then ln -s ~/dotfiles/.pi/agent/$f ~/.pi/agent/$f; fi; done \
 && ln -s ~/dotfiles/.omp/agent ~/.omp/agent \
 && ln -s ~/dotfiles/.config/herdr/config.toml ~/.config/herdr/config.toml \
 && ln -s ~/dotfiles/.config/herdr/scripts ~/.config/herdr/scripts \
 && ln -s ~/dotfiles/.config/nvim ~/.config/nvim \
 && ln -s ~/dotfiles/.config/yazi ~/.config/yazi

# pi's packages (settings.json "packages") into ~/.pi/agent/npm, so the first `pi -p` on a machine
# does not spend a minute installing them. Packages added to the dotfiles later install on first use.
RUN export PATH="$HOME/.bun/bin:$HOME/.local/share/fnm/aliases/default/bin:$PATH" \
 && pi update --extensions </dev/null \
 && rm -rf ~/.npm/_cacache

# Laptop files added to the build zip by `mvm image build`: the workspace repo list and git
# identity from the laptop's mvm settings (always there), allowlisted non-secret config, and git
# bundles of private repos (the build has no GitHub credentials).
COPY --chown=dev:dev laptop-files/ /opt/mvm/laptop-files/

# herdr ctrl+hjkl navigation plugin (private repo, native Rust build), linked like on the laptop.
RUN if [ ! -f /opt/mvm/laptop-files/herdr-vim-nav.bundle ]; then \
      echo "[mvm-build] no herdr-vim-nav bundle in the build zip, skipping the plugin"; exit 0; fi \
 && git clone --quiet /opt/mvm/laptop-files/herdr-vim-nav.bundle ~/Documents/github/kentoje/herdr-vim-nav \
 && cd ~/Documents/github/kentoje/herdr-vim-nav \
 && git remote set-url origin git@github.com:kentoje/herdr-vim-nav.git \
 && PATH="$HOME/.cargo/bin:$PATH" ./build.sh \
 && rm -rf target \
 && (~/.local/bin/herdr plugin link "$PWD" || echo "[mvm-build] herdr plugin link failed, link it after first login")

# Playwright Chromium for conversation-center-ext's e2e and for agent-browser.
# HOME=/root: ENV HOME is dev's, and npx as root would leave root-owned files in ~dev/.npm.
USER root
RUN export HOME=/root PATH="/home/dev/.local/share/fnm/aliases/default/bin:$PATH" \
 && npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm
USER dev
RUN export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH" \
 && npx -y "playwright@${PLAYWRIGHT_VERSION}" install chromium \
 && rm -rf ~/.npm/_npx \
 && (agent-browser doctor --offline --quick || echo "[mvm-build] agent-browser doctor reported issues")

# --- mvm runtime files ---------------------------------------------------------------------------
USER root
COPY rootfs/ /
RUN chmod 755 /opt/mvm/bin/* \
 && cat /opt/mvm/etc/dev-bashrc-prelude.sh /etc/skel/.bashrc >/home/dev/.bashrc \
 && chmod 755 /home/dev/.config/git/gitlab-credential.sh \
 && install -m 644 /opt/mvm/laptop-files/workspace-repos.txt /opt/mvm/etc/workspace-repos.txt \
 && install -m 644 /opt/mvm/laptop-files/git-identity.gitconfig /home/dev/.config/git/config \
 && if [ -f /opt/mvm/laptop-files/jira-config.yml ]; then \
      install -D -m 600 /opt/mvm/laptop-files/jira-config.yml /home/dev/.config/.jira/.config.yml; fi \
 && chown -R dev:dev /home/dev \
 && du -sh /home/dev /usr /opt 2>/dev/null; df -h / | tail -1

WORKDIR /
ENV HOME=/root
EXPOSE 2222 9000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/bin/python3", "/opt/mvm/bin/mvm-hook-server"]
