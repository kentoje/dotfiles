# ─── FE Setup for Claude Code — Test Container ──────────────────────────────
# Uses Homebrew on Linux to approximate a macOS dev environment.
# Build:  docker build -t fe-setup-claude .
# Test:   docker run -it --rm fe-setup-claude ./test.sh
# ─────────────────────────────────────────────────────────────────────────────

FROM homebrew/brew:latest

USER linuxbrew

# Install node via Homebrew (same as macOS)
RUN brew install node

# Install bun via official installer (same as macOS)
RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL="/home/linuxbrew/.bun"
ENV PATH="/home/linuxbrew/.bun/bin:/home/linuxbrew/.cache/.bun/bin:${PATH}"

# Prepare .claude directory structure
RUN mkdir -p /home/linuxbrew/.claude/skills \
    && mkdir -p /home/linuxbrew/.claude/mcp-servers

# Install global tools via bun
RUN bun install -g @anthropic-ai/claude-code \
    && bun install -g --trust agent-browser

# Download Chrome for Testing (skip gracefully on ARM64)
RUN agent-browser install 2>/dev/null \
    || echo "SKIP: Chrome for Testing not available on this arch (expected on ARM64 CI)"

# Verify core installations
RUN bun --version && claude --version && agent-browser --version && node --version

# Copy setup files
WORKDIR /setup
COPY --chown=linuxbrew:linuxbrew . .
RUN chmod +x setup.sh test.sh

CMD ["bash"]
