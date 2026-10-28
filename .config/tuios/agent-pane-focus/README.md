# Instant agent pane switching

`super+e` and `super+shift+e` execute this compiled Rust client directly through
TuiOS's `sh -c` command binding. Install or update it with:

```sh
~/.config/tuios/scripts/install-agent-pane-focus.sh
```

The client opens one daemon socket, performs the protocol handshake and preserves
pane permissions, reads live client/session focus and agent membership, then checks
only candidates it could select. It uses the same interactive-agent rules as the
previous shell script, including excluding Claude `--print` workflow children and
accepting protocol panes. Ordering is session, workspace, then daemon pane order.
All agent states remain reachable.

There is no cache, background service, TTL, or subscription to lose synchronization.
TuiOS does offer `subscribe` with lifecycle and agent events, replay and gap markers,
but its foreground detector is asynchronous; events are not an atomic process table.
Reading current membership on each press is cheap and avoids a second source of
membership state. Newly started agents become candidates when TuiOS identifies them
(the same daemon recognition boundary as its agent panel). The selected terminal
candidate gets a fresh process check even if an old hook report remains in the list.
Panes closed between listing, detection and focusing are skipped; other errors are
reported. No external reader can make process validation and focus one atomic daemon
operation, but the daemon resolves the target UUID again when it applies focus.

Focus is applied before switching sessions so a vanished target does not take the
client to an unrelated pane in another session. An advisory lock serializes repeat
presses. The daemon's focused pane and, when only one client is attached, its current
session override a renderer frame's stale environment. With multiple attached
clients, the binding's originating session selects the client as before.

Builds happen explicitly, never on keypress. The installer atomically replaces the
binary at `~/.local/bin/tuios-agent-pane-focus`. Existing TuiOS config reloads on save.
The old `scripts/cycle-agent-pane-focus.sh` entry point forwards to this binary.

## Verification

```sh
cargo test --locked --manifest-path ~/.config/tuios/agent-pane-focus/Cargo.toml
cargo clippy --locked --manifest-path ~/.config/tuios/agent-pane-focus/Cargo.toml --all-targets -- -D warnings
python3 ~/.config/tuios/scripts/test_cycle_agent_pane_focus.py
```

`--preview` reads and validates the next target without changing focus:

```sh
~/.local/bin/tuios-agent-pane-focus next --preview
```

For a live benchmark and lifecycle check in a disposable named daemon (does not
change focus in your sessions):

```sh
python3 ~/.config/tuios/scripts/benchmark_agent_pane_focus.py
```

On this Mac, 100 real focus requests through `sh -c` + `exec` took 9.9 ms median,
10.9 ms p95, with a 61.7 ms maximum outlier. This includes process startup, fresh
membership and target validation, and the daemon applying focus; it excludes the
terminal renderer presenting its next frame. The previous shell discovery alone
took 165–170 ms, with a 379 ms sample. These are measurements, not hard deadlines;
OS scheduling, fleet size and daemon load can increase latency.
