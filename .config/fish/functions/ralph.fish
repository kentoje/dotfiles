function ralph -d "Global Ralph autonomous agent for Claude Code"
    set -l CONFIG_FILE "$HOME/.config/ralph/config.json"

    if not test -f "$CONFIG_FILE"
        echo "Error: Ralph not configured. Run 'ralph setup' from the ralph repo first."
        return 1
    end

    set -l RALPH_HOME (cat "$CONFIG_FILE" | jq -r '.ralph_home')

    if test -z "$RALPH_HOME" -o "$RALPH_HOME" = "null"
        echo "Error: ralph_home not set in config."
        return 1
    end

    set -l RALPH_BIN "$RALPH_HOME/ralph"

    if not test -x "$RALPH_BIN"
        echo "Error: ralph binary not found at $RALPH_BIN"
        echo "Build it with: cd $RALPH_HOME && go build -o ralph ./cmd/ralph"
        return 1
    end

    $RALPH_BIN $argv
end
