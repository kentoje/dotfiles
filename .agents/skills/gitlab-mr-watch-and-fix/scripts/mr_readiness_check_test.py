"""Unit tests for the MR readiness verdict rules (fixtures shaped like GitLab API responses)."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from typing import Any

from mr_readiness_check import evaluate_mr_readiness

QODO = "service_account_group_8284447_d8d407ec69bdba6023f9557765ec3488"
SECURITY_GATE_BOT = "group_8284447_bot_5a645b147cafc8992d5950c48114c556"
AUTHOR = "kento.monthubert"
HEAD = "a" * 40
T0 = datetime(2026, 11, 2, 15, 0, tzinfo=timezone.utc)


def at(minutes: float) -> str:
    return (T0 + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def note(author: str, body: str, minutes: float, **extra: Any) -> dict[str, Any]:
    return {"author": {"username": author}, "body": body, "created_at": at(minutes), "system": False, **extra}


def system_note(body: str, minutes: float) -> dict[str, Any]:
    return {"author": {"username": AUTHOR}, "body": body, "created_at": at(minutes), "system": True}


def qodo_review(minutes: float) -> dict[str, Any]:
    return note(QODO, "<h3>Code Review by Qodo</h3>\n<code>🐞 Bugs (0)</code>", minutes)


def thread(author: str, resolved: bool, minutes: float = 1) -> dict[str, Any]:
    return {
        "id": f"d-{author}-{minutes}",
        "notes": [note(author, "finding", minutes, resolvable=True, resolved=resolved)],
    }


def snapshot(
    draft: bool = False,
    pipeline_status: str = "success",
    pipeline_sha: str = HEAD,
    jobs: list[dict[str, Any]] | None = None,
    notes: list[dict[str, Any]] | None = None,
    discussions: list[dict[str, Any]] | None = None,
    parent_shas: list[str] | None = None,
    **mr_extra: Any,
) -> dict[str, Any]:
    return {
        "mr": {
            "iid": 1,
            "sha": HEAD,
            "draft": draft,
            "created_at": at(0),
            "author": {"username": AUTHOR},
            "head_pipeline": {"id": 9, "sha": pipeline_sha, "status": pipeline_status},
            **mr_extra,
        },
        "notes": notes if notes is not None else [qodo_review(3)],
        "discussions": discussions or [],
        "pipeline_jobs": jobs or [],
        "head_pipeline_parent_shas": parent_shas or [],
        "approvals": {"approvals_required": 2, "approvals_left": 2, "approved_by": []},
    }


def evaluate(snap: dict[str, Any], minutes_now: float = 30, review_timeout: int = 900) -> dict[str, Any]:
    return evaluate_mr_readiness(snap, T0 + timedelta(minutes=minutes_now), review_timeout)


def action_names(result: dict[str, Any]) -> list[str]:
    return [action["action"] for action in result["actions"]]


class PipelineRulesTest(unittest.TestCase):
    def test_green_reviewed_mr_is_ready_for_human_review(self) -> None:
        result = evaluate(snapshot())
        self.assertEqual(result["verdict"], "ready_for_human_review")
        self.assertEqual(result["approvals"]["left"], 2)

    def test_pipeline_for_an_older_sha_is_pending(self) -> None:
        result = evaluate(snapshot(pipeline_sha="b" * 40))
        self.assertEqual(result["verdict"], "pending")
        self.assertFalse(result["pipeline_green"])

    def test_merged_results_pipeline_whose_parent_is_head_counts(self) -> None:
        result = evaluate(snapshot(pipeline_sha="c" * 40, parent_shas=["d" * 40, HEAD]))
        self.assertEqual(result["verdict"], "ready_for_human_review")

    def test_running_pipeline_is_pending(self) -> None:
        self.assertEqual(evaluate(snapshot(pipeline_status="running"))["verdict"], "pending")

    def test_failed_required_job_needs_a_fix(self) -> None:
        jobs = [
            {"name": "unit", "status": "failed", "allow_failure": False},
            {"name": "locale-drift", "status": "failed", "allow_failure": True},
        ]
        result = evaluate(snapshot(pipeline_status="failed", jobs=jobs))
        self.assertEqual(action_names(result), ["fix_failed_jobs"])
        self.assertEqual([job["name"] for job in result["actions"][0]["jobs"]], ["unit"])

    def test_failed_allow_failure_job_is_only_a_warning(self) -> None:
        jobs = [{"name": "locale-drift", "status": "failed", "allow_failure": True}]
        result = evaluate(snapshot(jobs=jobs))
        self.assertEqual(result["verdict"], "ready_for_human_review")
        self.assertIn("locale-drift", result["warnings"][0])

    def test_blocking_manual_job_is_a_blocker(self) -> None:
        jobs = [{"name": "approve-deploy", "status": "manual", "allow_failure": False}]
        result = evaluate(snapshot(pipeline_status="manual", jobs=jobs))
        self.assertEqual(action_names(result), ["report_blocker"])

    def test_manual_pipeline_with_only_optional_manual_jobs_is_green(self) -> None:
        jobs = [{"name": "build-staging", "status": "manual", "allow_failure": True}]
        self.assertTrue(evaluate(snapshot(pipeline_status="manual", jobs=jobs))["pipeline_green"])


class FeedbackRulesTest(unittest.TestCase):
    def test_unresolved_bot_thread_blocks(self) -> None:
        result = evaluate(snapshot(discussions=[thread(QODO, resolved=False)]))
        self.assertEqual(action_names(result), ["address_threads"])
        self.assertTrue(result["actions"][0]["threads"][0]["bot"])

    def test_declined_and_resolved_thread_does_not_block(self) -> None:
        declined = thread(QODO, resolved=True)
        declined["notes"].append(
            note(AUTHOR, "Not changing this one, because ...", 5, resolvable=True, resolved=True)
        )
        self.assertEqual(evaluate(snapshot(discussions=[declined]))["verdict"], "ready_for_human_review")

    def test_unanswered_human_comment_needs_a_reply(self) -> None:
        notes = [qodo_review(3), note(AUTHOR, "Fixed in abc", 4), note("reviewer.one", "Why this?", 6)]
        self.assertEqual(action_names(evaluate(snapshot(notes=notes))), ["reply_to_comments"])

    def test_answered_human_comment_does_not_block(self) -> None:
        notes = [qodo_review(3), note("reviewer.one", "Why this?", 6), note(AUTHOR, "Because ...", 7)]
        self.assertEqual(evaluate(snapshot(notes=notes))["verdict"], "ready_for_human_review")

    def test_failed_security_gate_blocks(self) -> None:
        notes = [qodo_review(3), note(SECURITY_GATE_BOT, "# Security Gate FAILED\n...", 5)]
        self.assertEqual(action_names(evaluate(snapshot(notes=notes))), ["fix_security_gate"])

    def test_newer_passed_security_gate_wins(self) -> None:
        notes = [
            qodo_review(3),
            note(SECURITY_GATE_BOT, "# Security Gate FAILED\n...", 5),
            note(SECURITY_GATE_BOT, "# Security Gate PASSED\n...", 9),
        ]
        self.assertEqual(evaluate(snapshot(notes=notes))["security_gate"], "PASSED")

    def test_unanswered_human_thread_needs_the_agent(self) -> None:
        result = evaluate(snapshot(discussions=[thread("reviewer.one", resolved=False)]))
        self.assertEqual(action_names(result), ["address_threads"])

    def test_answered_human_thread_waits_on_the_reviewer(self) -> None:
        answered = thread("reviewer.one", resolved=False)
        answered["notes"].append(note(AUTHOR, "Fixed in abc", 5, resolvable=True, resolved=False))
        result = evaluate(snapshot(discussions=[answered]))
        self.assertEqual(result["verdict"], "ready_for_human_review")
        self.assertEqual(len(result["awaiting_reviewer"]), 1)

    def test_answered_bot_thread_still_needs_resolving(self) -> None:
        answered = thread(QODO, resolved=False)
        answered["notes"].append(note(AUTHOR, "Fixed in abc", 5, resolvable=True, resolved=False))
        self.assertEqual(action_names(evaluate(snapshot(discussions=[answered]))), ["address_threads"])

    def test_conflicts_are_reported_not_rebased(self) -> None:
        result = evaluate(snapshot(has_conflicts=True))
        self.assertEqual(action_names(result), ["report_blocker"])
        self.assertIn("ask the user", result["actions"][0]["reason"])


class AutomatedReviewRulesTest(unittest.TestCase):
    def test_green_draft_without_review_asks_for_one(self) -> None:
        notes = [system_note("marked this merge request as **draft**", 0)]
        result = evaluate(snapshot(draft=True, notes=notes))
        self.assertEqual(action_names(result), ["request_automated_review"])

    def test_draft_waits_for_requested_review(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            note(AUTHOR, "/agentic_review", 20),
        ]
        result = evaluate(snapshot(draft=True, notes=notes), minutes_now=25)
        self.assertEqual(result["verdict"], "pending")
        self.assertEqual(result["automated_review"]["state"], "waiting")

    def test_draft_whose_review_never_came_is_marked_ready(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            note(AUTHOR, "/agentic_review", 20),
        ]
        result = evaluate(snapshot(draft=True, notes=notes), minutes_now=40)
        self.assertEqual(action_names(result), ["mark_ready"])

    def test_reviewed_clean_draft_is_marked_ready(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            note(AUTHOR, "/agentic_review", 20),
            qodo_review(24),
        ]
        self.assertEqual(action_names(evaluate(snapshot(draft=True, notes=notes))), ["mark_ready"])

    def test_ready_transition_on_already_reviewed_code_does_not_wait_again(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            note(AUTHOR, "/agentic_review", 20),
            qodo_review(24),
            system_note("marked this merge request as **ready**", 26),
        ]
        result = evaluate(snapshot(notes=notes), minutes_now=27)
        self.assertEqual(result["verdict"], "ready_for_human_review")

    def test_ready_transition_after_new_commits_waits_for_a_new_review(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            note(AUTHOR, "/agentic_review", 20),
            qodo_review(24),
            system_note("added 1 commit\n\n<ul><li>abc</li></ul>", 25),
            system_note("marked this merge request as **ready**", 26),
        ]
        self.assertEqual(evaluate(snapshot(notes=notes), minutes_now=27)["verdict"], "pending")

    def test_fix_push_after_review_does_not_wait_for_a_re_review(self) -> None:
        notes = [qodo_review(3), system_note("added 1 commit\n\n<ul><li>fix</li></ul>", 8)]
        self.assertEqual(evaluate(snapshot(notes=notes), minutes_now=9)["verdict"], "ready_for_human_review")

    def test_non_draft_review_timeout_is_a_warning_not_a_hang(self) -> None:
        result = evaluate(snapshot(notes=[]), minutes_now=30)
        self.assertEqual(result["verdict"], "ready_for_human_review")
        self.assertEqual(result["automated_review"]["state"], "timed_out")
        self.assertIn("no automated review", result["warnings"][0])

    def test_qodo_findings_posted_as_bare_badges_count_as_its_review(self) -> None:
        notes = [
            note(QODO, "<h3>PR Summary by Qodo</h3>", 1),
            system_note("marked this merge request as **draft**", 2),
            system_note("marked this merge request as **ready**", 20),
            note(QODO, '<img alt="Remediation recommended">', 23),
        ]
        self.assertEqual(
            evaluate(snapshot(notes=notes), minutes_now=24)["automated_review"]["state"], "reviewed"
        )

    def test_badge_only_findings_without_a_summary_count_as_the_review(self) -> None:
        notes = [
            system_note("marked this merge request as **draft**", 0),
            system_note("marked this merge request as **ready**", 20),
            note(QODO, '<img alt="Remediation recommended">', 23, resolvable=True, resolved=False),
        ]
        self.assertEqual(
            evaluate(snapshot(notes=notes), minutes_now=24)["automated_review"]["state"], "reviewed"
        )


if __name__ == "__main__":
    unittest.main()
