#!/usr/bin/env python3
"""Poll GitLab MR notes and print new non-system notes until quiet polls expire."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time


def fetch_notes(project: str, iid: str) -> list[dict]:
    raw = subprocess.check_output(
        [
            "glab",
            "api",
            f"projects/{project}/merge_requests/{iid}/notes?per_page=100",
        ],
        text=True,
    )
    return json.loads(raw)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True, help="URL-encoded GitLab project path")
    parser.add_argument("--iid", required=True)
    parser.add_argument("--after-id", type=int, default=0)
    parser.add_argument("--interval-seconds", type=int, default=600)
    parser.add_argument("--quiet-polls", type=int, default=3)
    args = parser.parse_args()

    last_id = args.after_id
    quiet = 0
    while quiet < args.quiet_polls:
        time.sleep(args.interval_seconds)
        notes = fetch_notes(args.project, args.iid)
        new_notes = sorted(
            (
                note
                for note in notes
                if not note.get("system") and note.get("id", 0) > last_id
            ),
            key=lambda note: note["id"],
        )
        if new_notes:
            for note in new_notes:
                print(
                    json.dumps(
                        {
                            "id": note["id"],
                            "created_at": note.get("created_at"),
                            "author": note.get("author", {}).get("username"),
                            "body": note.get("body"),
                        }
                    ),
                    flush=True,
                )
            last_id = new_notes[-1]["id"]
            quiet = 0
        else:
            quiet += 1
            print(f"quiet poll {quiet}/{args.quiet_polls}", flush=True)

    print("quiet period reached; stopping", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
