"""User-facing mvm errors and progress messages (stderr, so stdout stays clean for --json)."""

import sys


class MvmError(Exception):
    """A user-facing failure: printed as `mvm: <message>` without a traceback, exit code 1."""


def log_mvm(message):
    """Print one progress or warning line to stderr, prefixed with `mvm: `."""
    print(f"mvm: {message}", file=sys.stderr, flush=True)
