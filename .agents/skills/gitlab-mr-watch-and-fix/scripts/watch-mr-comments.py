#!/usr/bin/env python3
"""Poll one GitLab MR for new feedback and pipeline transitions."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from typing import Any

TERMINAL_PIPELINE_STATES = {
    "canceled",
    "cancelled",
    "failed",
    "manual",
    "skipped",
    "success",
}


def glab_json(endpoint: str) -> Any:
    raw = subprocess.check_output(["glab", "api", endpoint], text=True)
    return json.loads(raw)


def fetch_feedback(project: str, iid: str) -> dict[int, dict[str, Any]]:
    notes = glab_json(f"projects/{project}/merge_requests/{iid}/notes?per_page=100")
    discussions = glab_json(
        f"projects/{project}/merge_requests/{iid}/discussions?per_page=100"
    )
    feedback: dict[int, dict[str, Any]] = {}

    for note in notes:
        if not note.get("system"):
            feedback[note["id"]] = {**note, "source": "note"}

    for discussion in discussions:
        for note in discussion.get("notes", []):
            if not note.get("system"):
                feedback[note["id"]] = {
                    **note,
                    "source": "discussion",
                    "discussion_id": discussion.get("id"),
                }

    return feedback


def note_review_status(note: dict[str, Any]) -> str:
    if note.get("resolvable"):
        return "resolved" if note.get("resolved") else "unresolved"
    return "not-resolvable"


def needs_baseline_review(note: dict[str, Any]) -> bool:
    return note_review_status(note) != "resolved"


def note_state(note: dict[str, Any]) -> tuple[Any, ...]:
    return (
        note.get("updated_at"),
        note.get("body"),
        note.get("resolvable"),
        note.get("resolved"),
    )


def fetch_pipeline(project: str, mr: dict[str, Any]) -> dict[str, Any] | None:
    head_pipeline = mr.get("head_pipeline")
    if not head_pipeline or not head_pipeline.get("id"):
        return None
    return glab_json(f"projects/{project}/pipelines/{head_pipeline['id']}")


def print_feedback(note: dict[str, Any], event: str) -> None:
    print(
        json.dumps(
            {
                "event": event,
                "id": note["id"],
                "source": note.get("source"),
                "discussion_id": note.get("discussion_id"),
                "created_at": note.get("created_at"),
                "updated_at": note.get("updated_at"),
                "author": note.get("author", {}).get("username"),
                "resolvable": note.get("resolvable", False),
                "resolved": note.get("resolved"),
                "review_status": note_review_status(note),
                "body": note.get("body"),
            }
        ),
        flush=True,
    )


def pipeline_signature(pipeline: dict[str, Any] | None) -> tuple[Any, ...] | None:
    if pipeline is None:
        return None
    return (pipeline.get("id"), pipeline.get("sha"), pipeline.get("status"))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Watch GitLab MR feedback and pipeline transitions."
    )
    parser.add_argument("--project", required=True, help="URL-encoded GitLab project path")
    parser.add_argument("--iid", required=True, help="Merge request IID")
    parser.add_argument("--worktree", default="", help="Worktree recorded in the baseline")
    parser.add_argument("--interval-seconds", type=int, default=60)
    parser.add_argument("--quiet-seconds", type=int, default=600)
    parser.add_argument("--once", action="store_true", help="Capture baseline and exit")
    args = parser.parse_args()

    if args.interval_seconds <= 0 or args.quiet_seconds <= 0:
        parser.error("interval and quiet period must be positive")

    mr_endpoint = f"projects/{args.project}/merge_requests/{args.iid}"
    mr = glab_json(mr_endpoint)
    feedback = fetch_feedback(args.project, args.iid)
    feedback_state = {
        note_id: note_state(note) for note_id, note in feedback.items()
    }
    pipeline = fetch_pipeline(args.project, mr)
    pipeline_state = pipeline_signature(pipeline)
    print(
        json.dumps(
            {
                "event": "baseline",
                "mr": args.iid,
                "head_sha": mr.get("sha"),
                "source_branch": mr.get("source_branch"),
                "worktree": args.worktree,
                "note_ids": sorted(feedback),
                "pipeline": pipeline_state,
            }
        ),
        flush=True,
    )

    for note_id, note in sorted(feedback.items()):
        if needs_baseline_review(note):
            print_feedback(note, "baseline-feedback")

    if args.once:
        return 0

    quiet_started = time.monotonic()
    while True:
        time.sleep(args.interval_seconds)
        try:
            mr = glab_json(mr_endpoint)
            latest_feedback = fetch_feedback(args.project, args.iid)
            latest_pipeline = fetch_pipeline(args.project, mr)
        except (OSError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
            print(json.dumps({"event": "poll-error", "error": str(error)}), flush=True)
            continue

        changed = False
        for note_id, note in sorted(latest_feedback.items()):
            state = note_state(note)
            if note_id not in feedback_state:
                print_feedback(note, "new-feedback")
                changed = True
            elif feedback_state[note_id] != state:
                print_feedback(note, "updated-feedback")
                changed = True
        feedback_state = {
            note_id: note_state(note)
            for note_id, note in latest_feedback.items()
        }

        latest_pipeline_state = pipeline_signature(latest_pipeline)
        if latest_pipeline_state != pipeline_state:
            print(
                json.dumps(
                    {
                        "event": "pipeline-change",
                        "previous": pipeline_state,
                        "current": latest_pipeline_state,
                        "head_sha": mr.get("sha"),
                    }
                ),
                flush=True,
            )
            pipeline_state = latest_pipeline_state
            changed = True

        if changed or (
            latest_pipeline is not None
            and latest_pipeline.get("status") not in TERMINAL_PIPELINE_STATES
        ):
            quiet_started = time.monotonic()
        else:
            quiet_for = int(time.monotonic() - quiet_started)
            print(
                json.dumps(
                    {
                        "event": "quiet",
                        "quiet_seconds": quiet_for,
                        "quiet_target_seconds": args.quiet_seconds,
                    }
                ),
                flush=True,
            )
            if quiet_for >= args.quiet_seconds:
                print(json.dumps({"event": "quiet-period-reached"}), flush=True)
                return 0


if __name__ == "__main__":
    sys.exit(main())
