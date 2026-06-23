#!/usr/bin/env python3
"""dev-flow-status — board view of every in-flight dev-flow across worktrees.

Scans for .dev-flow.json manifests and prints one row per ticket, sorted by phase.
This is the "where is everything?" answer across parallel sessions and repos.

Usage:
  dev-flow-status.py                  # scan $DEV_FLOW_ROOTS, else current dir
  dev-flow-status.py ~/Documents/gitlab/dashboard-extensions/conversation-center-ext
  dev-flow-status.py --ready          # only gate-approved + LIVE-green MRs (as URLs)
  dev-flow-status.py --merge          # emit the handoff prompt to run aircall-merge-train
  dev-flow-status.py --json           # raw manifests as a JSON array

--ready / --merge ignore the manifest's (often stale) pipeline.status and query
GitLab live via `glab` for each manifest-approved MR, keeping those that are open
+ non-draft + pipeline not dead (failed/canceled). A still-running pipeline IS
handed over — the merge-train arms merge-when-pipeline-succeeds and polls. Excluded
MRs are listed on stderr with the reason (merged, closed, draft, pipeline failed).
Requires `glab` on PATH.

--merge does NOT merge anything itself: aircall-merge-train is a supervised,
human-gated skill driven by Claude, not a CLI. This flag just prints the ready
MRs as a ready-to-run instruction to launch that skill on them.

Roots: pass directories as args, or set DEV_FLOW_ROOTS (colon-separated) to point
at all your repos once. Each root is walked for `.dev-flow.json` (skipping
node_modules/.git/dist), so a repo's `.claude-worktrees/*/` are picked up.
"""
import sys, os, json, subprocess, shutil
from urllib.parse import urlparse, quote

PHASE_ORDER = ["scoped", "worktree", "implementing", "debugging",
               "gated", "approved", "shipped", "watching", "done"]
SKIP_DIRS = {"node_modules", ".git", "dist", ".next", "build", ".cache"}

def find_manifests(roots):
    found = {}
    for root in roots:
        root = os.path.abspath(os.path.expanduser(root))
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            if ".dev-flow.json" in filenames:
                p = os.path.join(dirpath, ".dev-flow.json")
                try:
                    with open(p) as fh:
                        found[p] = json.load(fh) or {}
                except (ValueError, json.JSONDecodeError, OSError):
                    pass
    return found

def phase_rank(m):
    try:
        return PHASE_ORDER.index(m.get("phase", ""))
    except ValueError:
        return len(PHASE_ORDER)

def pipeline_glyph(status):
    return {"success": "✅", "failed": "❌", "running": "🟡",
            "pending": "🟡", "canceled": "⚪", "manual": "⏸",
            "skipped": "⏭"}.get(status or "", "·")

def row(m):
    t = m.get("ticket", {}) or {}
    key = t.get("key") or "(no ticket)"
    slug = m.get("slug") or m.get("branch") or "?"
    phase = m.get("phase", "?")
    gate = m.get("gate", {}) or {}
    mr = m.get("mr", {}) or {}
    pl = m.get("pipeline", {}) or {}
    bits = []
    if phase == "gated" and not gate.get("approved"):
        bits.append("⛔ GATED (awaiting go)")
    else:
        bits.append(phase)
    if mr.get("id"):
        bits.append(f"MR !{mr['id']}")
    if pl.get("status"):
        bits.append(f"pipeline: {pipeline_glyph(pl['status'])} {pl['status']}")
    return key, slug, " · ".join(bits)

def is_ready(m):
    return (m.get("gate", {}) or {}).get("approved") and \
           (m.get("pipeline", {}) or {}).get("status") == "success"

def ready_urls(manifests):
    return [u for u in ((m.get("mr", {}) or {}).get("url") for m in manifests if is_ready(m)) if u]

def parse_mr_url(url):
    """https://host/group/sub/proj/-/merge_requests/42 -> ('group/sub/proj', '42')."""
    if not url:
        return None
    path = urlparse(url).path
    marker = "/-/merge_requests/"
    if marker not in path:
        return None
    proj, _, iid = path.partition(marker)
    iid = iid.strip("/").split("/")[0]
    return (proj.strip("/"), iid) if proj and iid.isdigit() else None

def live_mr(url):
    """Query GitLab via glab for an MR's live state. None if it can't be fetched."""
    ref = parse_mr_url(url)
    if not ref:
        return None
    proj, iid = ref
    enc = quote(proj, safe="")
    try:
        out = subprocess.run(
            ["glab", "api", f"projects/{enc}/merge_requests/{iid}"],
            capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    try:
        d = json.loads(out.stdout)
    except ValueError:
        return None
    return {
        "state": d.get("state"),
        "pipeline": (d.get("head_pipeline") or {}).get("status"),
        "merge_status": d.get("detailed_merge_status") or d.get("merge_status"),
        "draft": d.get("draft"),
    }

def ready_urls_live(manifests):
    """Filter manifest-approved MRs by LIVE GitLab state: open + green pipeline.

    Returns (ready_urls, skipped) where skipped is a list of (url, reason) for
    every approved MR that did NOT make the cut — printed so the user sees why.
    The manifest's own pipeline.status is ignored here; GitLab is the truth.
    """
    if not shutil.which("glab"):
        return None, [("", "glab not found on PATH — install/auth glab to use live --merge")]
    ready, skipped = [], []
    approved = [m for m in manifests
                if (m.get("gate", {}) or {}).get("approved")
                and (m.get("mr", {}) or {}).get("url")]
    for m in approved:
        url = m["mr"]["url"]
        live = live_mr(url)
        if live is None:
            skipped.append((url, "couldn't fetch live status from GitLab"))
            continue
        if live["state"] != "opened":
            skipped.append((url, f"MR is {live['state']} (not open)"))
            continue
        if live.get("draft"):
            skipped.append((url, "MR is a draft"))
            continue
        # The merge-train arms merge-when-pipeline-succeeds and polls, so a still-
        # running pipeline is fine to hand over — only exclude dead ones.
        if live["pipeline"] in ("failed", "canceled"):
            skipped.append((url, f"pipeline: {live['pipeline']} (dead — fix & re-push)"))
            continue
        ready.append(url)
    return ready, skipped

def main(argv):
    ready_only = "--ready" in argv
    merge = "--merge" in argv
    as_json = "--json" in argv
    if "-h" in argv or "--help" in argv:
        print(__doc__); return 0
    roots = [a for a in argv if not a.startswith("-")]
    if not roots:
        env = os.environ.get("DEV_FLOW_ROOTS", "")
        roots = [r for r in env.split(":") if r] or [os.getcwd()]

    manifests = list(find_manifests(roots).values())

    if as_json:
        print(json.dumps(manifests, indent=2, ensure_ascii=False)); return 0

    if ready_only or merge:
        print("checking live pipeline status on GitLab…", file=sys.stderr)
        urls, skipped = ready_urls_live(manifests)
        for u, why in skipped:
            print(f"  skip {u or '(approved MR)'}: {why}", file=sys.stderr)
        if not urls:
            print("no gate-approved + green (live) MRs ready for merge-train.", file=sys.stderr)
            return 1
        if ready_only:
            print("\n".join(urls)); return 0
        # Handoff prompt for Claude — aircall-merge-train is agent-driven, not a CLI.
        print("Use the aircall-merge-train skill to merge these approved, open MRs "
              "(arm merge-when-pipeline-succeeds for any still running):")
        for u in urls:
            print(f"  {u}")
        return 0

    if not manifests:
        print("no dev-flow manifests found. Scanned: " + ", ".join(roots), file=sys.stderr)
        return 1

    manifests.sort(key=phase_rank)
    rows = [row(m) for m in manifests]
    w_key = max((len(r[0]) for r in rows), default=3)
    w_slug = max((len(r[1]) for r in rows), default=4)
    for key, slug, summary in rows:
        print(f"{key:<{w_key}}  {slug:<{w_slug}}  {summary}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
