#!/usr/bin/env python3
"""Check whether one GitLab merge request is ready for human review.

Answers "is this MR ready for human review?" from the GitLab API alone:
the head pipeline on the current head SHA, failed jobs, unresolved threads,
unanswered comments, the Security Gate note, and the automated code review
(Qodo, triggered by marking the MR ready or by an `/agentic_review` comment).

Prints one JSON verdict on stdout. Exit codes:
  0   ready_for_human_review
  10  action_required   (the `actions` list says what to do next)
  20  pending           (CI or the automated review is still running)
  2   error             (GitLab API or usage error)

`--wait` polls until the verdict is not pending or `--max-wait-seconds` passes,
so one foreground call blocks while CI runs instead of the agent sleeping.
Read-only: it never comments, pushes, or changes the MR.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any

EXIT_READY_FOR_HUMAN_REVIEW = 0
EXIT_ACTION_REQUIRED = 10
EXIT_PENDING = 20
EXIT_ERROR = 2

PIPELINE_RUNNING_STATES = {
    "created",
    "waiting_for_resource",
    "preparing",
    "pending",
    "running",
    "scheduled",
    "waiting_for_callback",
}

# Bot accounts on gitlab.com: group/project access tokens and service accounts.
GITLAB_BOT_USERNAME_PATTERN = re.compile(r"^(service_account_|group_\d+_bot_|project_\d+_bot_)")
QODO_REVIEW_MARKER = "by Qodo"
# Aircall's Qodo service account (same in every aircall/* project); other accounts are learned from notes.
KNOWN_QODO_USERNAMES = frozenset({"service_account_group_8284447_d8d407ec69bdba6023f9557765ec3488"})
AGENTIC_REVIEW_COMMAND_PATTERN = re.compile(r"^\s*/agentic_review\b")
MARKED_READY_SYSTEM_NOTE = "marked this merge request as **ready**"
SECURITY_GATE_PREFIX = "# Security Gate"


def parse_gitlab_time(value: str) -> datetime:
    """Parses a GitLab ISO 8601 timestamp into an aware UTC datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def is_gitlab_bot_username(username: str) -> bool:
    """Tells whether a GitLab username is a bot account (access token or service account)."""
    return bool(GITLAB_BOT_USERNAME_PATTERN.match(username or ""))


def note_author_username(note: dict[str, Any]) -> str:
    return (note.get("author") or {}).get("username") or ""


def find_qodo_usernames(notes: list[dict[str, Any]]) -> set[str]:
    """Qodo posts findings as bare badges, so its account is known up front or learned from its summary notes."""
    return set(KNOWN_QODO_USERNAMES) | {
        note_author_username(note)
        for note in notes
        if not note.get("system")
        and is_gitlab_bot_username(note_author_username(note))
        and QODO_REVIEW_MARKER in (note.get("body") or "")
    }


def latest_automated_review_request(mr: dict[str, Any], notes: list[dict[str, Any]]) -> datetime | None:
    """When the automated code review was last asked for: ready transition, `/agentic_review`, or MR creation.

    Qodo skips draft MRs: it reviews when an MR is marked ready, when it is created
    non-draft, and on an `/agentic_review` comment. It does not re-review plain pushes.
    """
    request_times: list[datetime] = []
    has_draft_history = False
    for note in notes:
        body = note.get("body") or ""
        if note.get("system"):
            if "as **draft**" in body or MARKED_READY_SYSTEM_NOTE in body:
                has_draft_history = True
            if MARKED_READY_SYSTEM_NOTE in body:
                request_times.append(parse_gitlab_time(note["created_at"]))
        elif AGENTIC_REVIEW_COMMAND_PATTERN.match(body):
            request_times.append(parse_gitlab_time(note["created_at"]))
    if not mr.get("draft") and not has_draft_history and mr.get("created_at"):
        request_times.append(parse_gitlab_time(mr["created_at"]))
    return max(request_times) if request_times else None


def latest_code_change_time(mr: dict[str, Any], notes: list[dict[str, Any]]) -> datetime | None:
    """When the MR's code last changed: its creation or the newest "added N commit(s)" system note."""
    times = [
        parse_gitlab_time(note["created_at"])
        for note in notes
        if note.get("system") and re.match(r"^added \d+ (new )?commits?\b", note.get("body") or "")
    ]
    if mr.get("created_at"):
        times.append(parse_gitlab_time(mr["created_at"]))
    return max(times) if times else None


def summarize_unresolved_threads(
    discussions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Every open resolvable discussion, bot or human, any severity."""
    threads = []
    for discussion in discussions:
        notes = [note for note in discussion.get("notes", []) if not note.get("system")]
        resolvable = [note for note in notes if note.get("resolvable")]
        if not resolvable or all(note.get("resolved") for note in resolvable):
            continue
        first = notes[0]
        position = first.get("position") or {}
        threads.append(
            {
                "discussion_id": discussion.get("id"),
                "author": note_author_username(first),
                "bot": is_gitlab_bot_username(note_author_username(first)),
                "file": position.get("new_path") or position.get("old_path"),
                "line": position.get("new_line") or position.get("old_line"),
                "body": (first.get("body") or "")[:600],
                "replies": len(notes) - 1,
                "last_author": note_author_username(notes[-1]),
            }
        )
    return threads


def find_unanswered_human_comments(mr: dict[str, Any], notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Plain (non-thread) comments from other humans posted after the MR author's last note."""
    mr_author = note_author_username(mr)
    author_note_times = [
        parse_gitlab_time(note["created_at"])
        for note in notes
        if not note.get("system") and note_author_username(note) == mr_author
    ]
    last_author_note = max(author_note_times) if author_note_times else None
    unanswered = []
    for note in notes:
        username = note_author_username(note)
        if (
            note.get("system")
            or note.get("resolvable")
            or username == mr_author
            or is_gitlab_bot_username(username)
        ):
            continue
        created = parse_gitlab_time(note["created_at"])
        if last_author_note is None or created > last_author_note:
            unanswered.append(
                {"id": note.get("id"), "author": username, "body": (note.get("body") or "")[:600]}
            )
    return unanswered


def latest_security_gate_result(notes: list[dict[str, Any]]) -> str | None:
    """PASSED or FAILED from the newest Security Gate note, None when it never posted."""
    gate_notes = [
        note
        for note in notes
        if not note.get("system") and (note.get("body") or "").startswith(SECURITY_GATE_PREFIX)
    ]
    if not gate_notes:
        return None
    newest = max(gate_notes, key=lambda note: parse_gitlab_time(note["created_at"]))
    return "FAILED" if "FAILED" in newest["body"].splitlines()[0] else "PASSED"


def evaluate_mr_readiness(
    snapshot: dict[str, Any],
    now: datetime,
    automated_review_timeout_seconds: int,
) -> dict[str, Any]:
    """Turns one MR snapshot into a verdict: ready_for_human_review, action_required, or pending.

    `snapshot` holds `mr`, `notes`, `discussions`, `pipeline_jobs` (head pipeline jobs, or None),
    `head_pipeline_parent_shas` (parents of a merged-results pipeline's commit) and `approvals`. Pure: no API calls, so the rules are unit tested on fixtures.
    """
    mr = snapshot["mr"]
    notes = snapshot["notes"]
    actions: list[dict[str, Any]] = []
    waiting: list[str] = []
    warnings: list[str] = []

    head_sha = mr.get("sha")
    pipeline = mr.get("head_pipeline") or None
    pipeline_report: dict[str, Any] = {"id": None, "sha": None, "status": None, "web_url": None}
    pipeline_green = False
    if pipeline is None:
        waiting.append("no pipeline exists for this MR yet")
    else:
        pipeline_report = {
            "id": pipeline.get("id"),
            "sha": pipeline.get("sha"),
            "status": pipeline.get("status"),
            "web_url": pipeline.get("web_url"),
        }
        status = pipeline.get("status")
        jobs = snapshot.get("pipeline_jobs") or []
        failed_required = [
            job for job in jobs if job.get("status") == "failed" and not job.get("allow_failure")
        ]
        failed_optional = [job for job in jobs if job.get("status") == "failed" and job.get("allow_failure")]
        blocking_manual = [
            job for job in jobs if job.get("status") == "manual" and not job.get("allow_failure")
        ]
        # Merged-results pipelines run on refs/merge-requests/<iid>/merge: their SHA is a
        # merge commit whose parents include the MR head.
        pipeline_tests_head = pipeline.get("sha") == head_sha or head_sha in (
            snapshot.get("head_pipeline_parent_shas") or []
        )
        if not pipeline_tests_head:
            waiting.append(
                f"head pipeline is for {str(pipeline.get('sha'))[:9]}, not head {str(head_sha)[:9]}"
            )
        elif status in PIPELINE_RUNNING_STATES:
            waiting.append(f"pipeline {pipeline.get('id')} is {status}")
        elif status == "success" or (status == "manual" and not blocking_manual):
            pipeline_green = True
        elif status == "failed":
            actions.append(
                {
                    "action": "fix_failed_jobs",
                    "jobs": [
                        {"name": job.get("name"), "stage": job.get("stage"), "web_url": job.get("web_url")}
                        for job in failed_required
                    ],
                }
            )
        elif status == "manual":
            actions.append(
                {
                    "action": "report_blocker",
                    "reason": "pipeline waits on manual jobs that are not allow_failure",
                    "jobs": [job.get("name") for job in blocking_manual],
                }
            )
        else:
            actions.append(
                {"action": "report_blocker", "reason": f"pipeline {pipeline.get('id')} is {status}"}
            )
        if failed_optional:
            warnings.append(
                "allow_failure jobs failed (check whether this change caused them): "
                + ", ".join(sorted(job.get("name") or "?" for job in failed_optional))
            )

    # Bot threads are always the agent's to close (fix, or decline with a reason, then resolve).
    # A human thread the MR author already answered waits on that reviewer, not on the agent.
    mr_author = note_author_username(mr)
    awaiting_reviewer: list[dict[str, Any]] = []
    threads_to_address: list[dict[str, Any]] = []
    for open_thread in summarize_unresolved_threads(snapshot["discussions"]):
        if (
            not open_thread["bot"]
            and open_thread["author"] != mr_author
            and open_thread["last_author"] == mr_author
        ):
            awaiting_reviewer.append(open_thread)
        else:
            threads_to_address.append(open_thread)
    if threads_to_address:
        actions.append({"action": "address_threads", "threads": threads_to_address})
    if awaiting_reviewer:
        warnings.append(
            f"{len(awaiting_reviewer)} human thread(s) answered, waiting on the reviewer to resolve"
        )

    unanswered_comments = find_unanswered_human_comments(mr, notes)
    if unanswered_comments:
        actions.append({"action": "reply_to_comments", "comments": unanswered_comments})

    security_gate = latest_security_gate_result(notes)
    if security_gate == "FAILED":
        actions.append({"action": "fix_security_gate", "reason": "newest Security Gate note is FAILED"})

    if mr.get("has_conflicts"):
        actions.append(
            {
                "action": "report_blocker",
                "reason": "merge conflicts with the target branch: rebasing rewrites history, ask the user first",
            }
        )
    if mr.get("detailed_merge_status") == "need_rebase":
        warnings.append("target branch moved: a rebase is needed before merge (merge-time concern)")

    # Automated code review (Qodo).
    qodo_usernames = find_qodo_usernames(notes)
    review_requested_at = latest_automated_review_request(mr, notes)
    review_report: dict[str, Any] = {
        "reviewer": sorted(qodo_usernames) or None,
        "requested_at": review_requested_at.isoformat() if review_requested_at else None,
        "reviewed_at": None,
        "state": None,
    }
    reviewed_times = [
        parse_gitlab_time(note["created_at"])
        for note in notes
        if not note.get("system") and note_author_username(note) in qodo_usernames
    ]
    last_code_change = latest_code_change_time(mr, notes)
    if review_requested_at is not None:
        # Reviewed: Qodo posted after the latest request, or it already reviewed the current
        # commits (a ready transition right after an `/agentic_review` on unchanged code).
        after_request = [
            time_
            for time_ in reviewed_times
            if time_ >= review_requested_at or (last_code_change is not None and time_ >= last_code_change)
        ]
        if after_request:
            review_report["reviewed_at"] = max(after_request).isoformat()
            review_report["state"] = "reviewed"
        elif (now - review_requested_at).total_seconds() < automated_review_timeout_seconds:
            review_report["state"] = "waiting"
        else:
            review_report["state"] = "timed_out"
    else:
        review_report["state"] = "not_requested"

    nothing_else_to_do = not actions and not waiting
    if review_report["state"] == "waiting":
        waiting.append("automated review (Qodo) requested, not posted yet")
    elif review_report["state"] == "not_requested" and nothing_else_to_do:
        actions.append(
            {
                "action": "request_automated_review",
                "reason": "draft MR: Qodo skips drafts; comment `/agentic_review` to request it",
            }
        )
    elif review_report["state"] == "timed_out":
        if mr.get("draft") and nothing_else_to_do:
            actions.append(
                {
                    "action": "mark_ready",
                    "reason": "no Qodo review on the draft after the timeout; marking ready triggers it",
                }
            )
        elif not mr.get("draft"):
            warnings.append(
                f"no automated review (Qodo) within {automated_review_timeout_seconds}s of the last request"
            )

    # A draft whose checks and reviews are all done only needs marking ready.
    if mr.get("draft") and not actions and not waiting:
        actions.append({"action": "mark_ready", "reason": "checks and automated review are done"})

    if actions:
        verdict = "action_required"
    elif waiting:
        verdict = "pending"
    else:
        verdict = "ready_for_human_review"

    approvals = snapshot.get("approvals") or {}
    return {
        "verdict": verdict,
        "mr": {
            "iid": mr.get("iid"),
            "web_url": mr.get("web_url"),
            "draft": mr.get("draft"),
            "head_sha": head_sha,
            "source_branch": mr.get("source_branch"),
            "target_branch": mr.get("target_branch"),
            "detailed_merge_status": mr.get("detailed_merge_status"),
        },
        "pipeline": pipeline_report,
        "pipeline_green": pipeline_green,
        "security_gate": security_gate,
        "automated_review": review_report,
        "approvals": {
            "required": approvals.get("approvals_required"),
            "left": approvals.get("approvals_left"),
            "approved_by": [
                (entry.get("user") or {}).get("username") for entry in approvals.get("approved_by", [])
            ],
        },
        "actions": actions,
        "waiting_on": waiting,
        "awaiting_reviewer": awaiting_reviewer,
        "warnings": warnings,
        "checked_at": now.isoformat(),
    }


def glab_api_json(endpoint: str) -> Any:
    raw = subprocess.check_output(["glab", "api", endpoint], text=True, timeout=60)
    return json.loads(raw)


def glab_api_all_pages(endpoint: str) -> list[Any]:
    separator = "&" if "?" in endpoint else "?"
    items: list[Any] = []
    page = 1
    while True:
        batch = glab_api_json(f"{endpoint}{separator}per_page=100&page={page}")
        items.extend(batch)
        if len(batch) < 100:
            return items
        page += 1


def fetch_mr_readiness_snapshot(project: str, iid: str) -> dict[str, Any]:
    """Reads everything `evaluate_mr_readiness` needs from the GitLab API."""
    base = f"projects/{project}/merge_requests/{iid}"
    mr = glab_api_json(base)
    pipeline = mr.get("head_pipeline") or None
    pipeline_jobs = None
    head_pipeline_parent_shas: list[str] = []
    if pipeline and pipeline.get("id"):
        pipeline_jobs = glab_api_all_pages(f"projects/{project}/pipelines/{pipeline['id']}/jobs")
        if pipeline.get("sha") != mr.get("sha"):
            commit = glab_api_json(f"projects/{project}/repository/commits/{pipeline['sha']}")
            head_pipeline_parent_shas = commit.get("parent_ids") or []
    return {
        "mr": mr,
        "head_pipeline_parent_shas": head_pipeline_parent_shas,
        "notes": glab_api_all_pages(f"{base}/notes?sort=asc"),
        "discussions": glab_api_all_pages(f"{base}/discussions"),
        "pipeline_jobs": pipeline_jobs,
        "approvals": glab_api_json(f"{base}/approvals"),
    }


def exit_code_for_verdict(verdict: str) -> int:
    return {
        "ready_for_human_review": EXIT_READY_FOR_HUMAN_REVIEW,
        "action_required": EXIT_ACTION_REQUIRED,
        "pending": EXIT_PENDING,
    }[verdict]


def main() -> int:
    parser = argparse.ArgumentParser(description="Check whether a GitLab MR is ready for human review.")
    parser.add_argument(
        "--project", required=True, help="URL-encoded project path, e.g. aircall%%2Fclients%%2Fdashboard-v4"
    )
    parser.add_argument("--iid", required=True, help="Merge request IID")
    parser.add_argument("--wait", action="store_true", help="Poll until the verdict is not pending")
    parser.add_argument(
        "--max-wait-seconds",
        type=int,
        default=480,
        help="Upper bound for --wait (keep under the agent's tool timeout)",
    )
    parser.add_argument("--interval-seconds", type=int, default=45)
    parser.add_argument(
        "--automated-review-timeout-seconds",
        type=int,
        default=900,
        help="How long after a review request to wait for Qodo before giving up (0: do not wait)",
    )
    args = parser.parse_args()
    if args.interval_seconds <= 0 or args.max_wait_seconds < 0:
        parser.error("interval must be positive and max wait non-negative")

    deadline = time.monotonic() + args.max_wait_seconds
    consecutive_errors = 0
    while True:
        try:
            snapshot = fetch_mr_readiness_snapshot(args.project, args.iid)
            consecutive_errors = 0
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
            consecutive_errors += 1
            if not args.wait or consecutive_errors >= 3 or time.monotonic() >= deadline:
                print(json.dumps({"verdict": "error", "error": f"MR readiness fetch failed: {error}"}))
                return EXIT_ERROR
            time.sleep(min(args.interval_seconds, max(1.0, deadline - time.monotonic())))
            continue

        result = evaluate_mr_readiness(
            snapshot, datetime.now(timezone.utc), args.automated_review_timeout_seconds
        )
        if not args.wait or result["verdict"] != "pending" or time.monotonic() >= deadline:
            print(json.dumps(result, indent=2))
            return exit_code_for_verdict(result["verdict"])
        print(f"pending: {'; '.join(result['waiting_on'])}", file=sys.stderr, flush=True)
        time.sleep(min(args.interval_seconds, max(1.0, deadline - time.monotonic())))


if __name__ == "__main__":
    sys.exit(main())
