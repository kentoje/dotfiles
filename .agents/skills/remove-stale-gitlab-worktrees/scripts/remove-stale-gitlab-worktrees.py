#!/usr/bin/env python3
"""Find GitLab worktrees without an open MR and remove them after confirmation.

The script discovers Git repositories below the configured GitLab roots and Maestro
worktree storage, asks GitLab whether each present non-primary worktree has an open
merge request, and removes only candidates with no open MR. It is dry-run by default.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


SKIP_DIRECTORY_NAMES = {
    ".git",
    "node_modules",
    ".next",
    ".pnpm",
    ".yarn",
    ".turbo",
    ".nx",
    ".cache",
    "build",
    "coverage",
    "dist",
    "target",
    "vendor",
}


@dataclass(frozen=True)
class GitWorktree:
    """A non-primary local Git worktree and the repository that owns it."""

    repository_path: Path
    project_path: str
    worktree_path: Path
    branch: str | None
    commit: str
    is_dirty: bool | None


class GitLabQueryError(RuntimeError):
    """Raised when GitLab cannot authoritatively report a worktree's MR state."""


def run_command(*args: str, cwd: Path | None = None) -> str:
    """Run a command or raise an error containing its complete stderr."""

    result = subprocess.run(
        args,
        cwd=cwd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode:
        command = " ".join(args)
        raise RuntimeError(f"{command} failed: {result.stderr.strip()}")
    return result.stdout


def git_output(repository_path: Path, *args: str) -> str:
    """Run Git against a repository or linked worktree."""

    return run_command("git", "-C", str(repository_path), *args)


def discover_git_repositories(search_roots: list[Path]) -> list[Path]:
    """Find repositories below the supplied roots, pruning generated directories."""

    repositories: list[Path] = []
    for search_root in search_roots:
        if not search_root.is_dir():
            continue
        for directory, child_directories, files in os.walk(search_root, topdown=True):
            child_directories[:] = [
                name for name in child_directories if name not in SKIP_DIRECTORY_NAMES
            ]
            current_path = Path(directory)
            git_path = current_path / ".git"
            if git_path.is_dir() or git_path.is_file():
                repositories.append(current_path)
                child_directories[:] = [
                    name
                    for name in child_directories
                    if name not in {".claude", ".claude-worktrees", "worktrees"}
                ]
    return repositories


def parse_git_worktree_list(repository_path: Path) -> list[dict[str, str]]:
    """Parse `git worktree list --porcelain` into Git's documented records."""

    output = git_output(repository_path, "worktree", "list", "--porcelain")
    records: list[dict[str, str]] = []
    record: dict[str, str] = {}
    for line in output.splitlines():
        if not line:
            if record:
                records.append(record)
                record = {}
            continue
        key, _, value = line.partition(" ")
        record[key] = value
    if record:
        records.append(record)
    return records


def gitlab_project_path(repository_path: Path) -> str | None:
    """Return origin's GitLab namespace/project path, or None for other forges."""

    try:
        remote_url = git_output(repository_path, "remote", "get-url", "origin").strip()
    except RuntimeError:
        return None
    if "gitlab" not in remote_url:
        return None
    if remote_url.startswith("git@") and ":" in remote_url:
        project_path = remote_url.split(":", 1)[1]
    elif "gitlab.com/" in remote_url:
        project_path = remote_url.split("gitlab.com/", 1)[1]
    else:
        return None
    return project_path.removesuffix(".git").strip("/")


def is_worktree_dirty(worktree_path: Path) -> bool:
    """Report whether a currently present worktree has tracked or untracked changes."""

    return bool(git_output(worktree_path, "status", "--porcelain").strip())


def is_worktree_usable(worktree_path: Path) -> bool:
    """Return whether Git can still resolve a present worktree's metadata."""

    result = subprocess.run(
        ["git", "-C", str(worktree_path), "rev-parse", "--is-inside-work-tree"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def discover_gitlab_worktrees(search_roots: list[Path]) -> list[GitWorktree]:
    """Return all present non-primary worktrees owned by discovered GitLab repos."""

    repositories_by_common_directory: dict[Path, Path] = {}
    for repository_path in discover_git_repositories(search_roots):
        try:
            common_directory = Path(
                git_output(repository_path, "rev-parse", "--git-common-dir").strip()
            )
            if not common_directory.is_absolute():
                common_directory = (repository_path / common_directory).resolve()
            repositories_by_common_directory.setdefault(common_directory, repository_path)
        except RuntimeError as error:
            print(f"warning: skipping {repository_path}: {error}", file=sys.stderr)

    worktrees_by_path: dict[Path, GitWorktree] = {}
    for repository_path in repositories_by_common_directory.values():
        project_path = gitlab_project_path(repository_path)
        if project_path is None:
            continue
        records = parse_git_worktree_list(repository_path)
        if not records:
            continue
        primary_worktree_path = Path(records[0]["worktree"])
        if not is_worktree_usable(primary_worktree_path):
            print(
                f"warning: skipping {project_path}; its primary worktree is unusable at "
                f"{primary_worktree_path}",
                file=sys.stderr,
            )
            continue
        for record in records[1:]:
            worktree_path = Path(record["worktree"])
            if not worktree_path.is_dir() or worktree_path == primary_worktree_path:
                continue
            branch = record.get("branch", "").removeprefix("refs/heads/") or None
            if is_worktree_usable(worktree_path):
                try:
                    dirty: bool | None = is_worktree_dirty(worktree_path)
                except RuntimeError as error:
                    raise RuntimeError(
                        f"Cannot inspect {worktree_path}; refusing to classify it: {error}"
                    ) from error
            else:
                dirty = None
                print(
                    f"warning: worktree metadata is broken at {worktree_path}; "
                    "its local changes cannot be inspected",
                    file=sys.stderr,
                )
            worktrees_by_path.setdefault(
                worktree_path,
                GitWorktree(
                    repository_path=primary_worktree_path,
                    project_path=project_path,
                    worktree_path=worktree_path,
                    branch=branch,
                    commit=record["HEAD"],
                    is_dirty=dirty,
                ),
            )
    return sorted(
        worktrees_by_path.values(),
        key=lambda worktree: (worktree.project_path, str(worktree.worktree_path)),
    )


def gitlab_open_merge_requests(worktree: GitWorktree) -> list[dict[str, object]]:
    """Return open GitLab MRs for the worktree branch or detached commit."""

    encoded_project = quote(worktree.project_path, safe="")
    if worktree.branch is not None:
        endpoint = (
            f"/projects/{encoded_project}/merge_requests?state=opened&source_branch="
            f"{quote(worktree.branch, safe='')}"
        )
    else:
        endpoint = (
            f"/projects/{encoded_project}/repository/commits/{worktree.commit}"
            "/merge_requests?state=opened"
        )
    try:
        output = run_command("glab", "api", "--hostname", "gitlab.com", endpoint)
        response = json.loads(output)
    except (RuntimeError, json.JSONDecodeError) as error:
        raise GitLabQueryError(
            f"Cannot query open merge requests for {worktree.worktree_path}: {error}"
        ) from error
    if not isinstance(response, list):
        raise GitLabQueryError(
            f"Unexpected GitLab response for {worktree.worktree_path}: {output[:200]}"
        )
    return response


def print_worktree_candidates(candidates: list[GitWorktree]) -> None:
    """Print a reviewable list before any destructive operation is attempted."""

    if not candidates:
        print("No stale GitLab worktrees found.")
        return
    print(f"Stale GitLab worktrees without an open merge request: {len(candidates)}")
    for index, candidate in enumerate(candidates, start=1):
        reference = candidate.branch or f"detached at {candidate.commit[:12]}"
        if candidate.is_dirty is True:
            state = "dirty; requires --force-dirty"
        elif candidate.is_dirty is False:
            state = "clean"
        else:
            state = "broken metadata; requires --force-uninspectable"
        print(f"{index:>3}. {candidate.project_path} | {reference} | {state}")
        print(f"     {candidate.worktree_path}")


def selected_stale_worktrees(
    stale_worktrees: list[GitWorktree],
    allow_dirty_removal: bool,
    allow_uninspectable_removal: bool,
) -> list[GitWorktree]:
    """Return removable candidates while defaulting to preservation of unknown state."""

    return [
        worktree
        for worktree in stale_worktrees
        if worktree.is_dirty is False
        or (worktree.is_dirty is True and allow_dirty_removal)
        or (worktree.is_dirty is None and allow_uninspectable_removal)
    ]


def remove_stale_worktrees(candidates: list[GitWorktree]) -> None:
    """Remove eligible worktrees, pruning metadata when a worktree is broken."""

    touched_repositories: set[Path] = set()
    for candidate in candidates:
        if candidate.is_dirty is None:
            print(f"Pruning broken worktree metadata for {candidate.worktree_path}")
            git_output(candidate.repository_path, "worktree", "prune")
        else:
            print(f"Removing {candidate.worktree_path}")
            run_command(
                "git",
                "-C",
                str(candidate.repository_path),
                "worktree",
                "remove",
                "--force",
                str(candidate.worktree_path),
            )
        touched_repositories.add(candidate.repository_path)
    for repository_path in sorted(touched_repositories):
        print(f"Pruning worktree metadata in {repository_path}")
        git_output(repository_path, "worktree", "prune")


def default_search_roots() -> list[Path]:
    """Return existing machine-standard GitLab and Maestro worktree locations."""

    home_directory = Path.home()
    maestro_home = Path(
        os.environ.get("MAESTRO_HOME", "/Volumes/HomeX/kento/.maestro")
    ).expanduser()
    candidates = [
        home_directory / "Documents/gitlab",
        Path("/Volumes/HomeX/kento/Documents/gitlab"),
        maestro_home / "worktrees",
    ]
    unique_candidates: list[Path] = []
    for candidate in candidates:
        if candidate.is_dir() and candidate not in unique_candidates:
            unique_candidates.append(candidate)
    return unique_candidates


def parse_arguments() -> argparse.Namespace:
    """Parse audit roots and the explicit destructive-operation flag."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        action="append",
        type=Path,
        help="Repository root to scan; repeatable. Defaults to local GitLab and Maestro roots.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Prompt for confirmation, then remove every eligible stale worktree.",
    )
    parser.add_argument(
        "--worktree",
        action="append",
        type=Path,
        help="Restrict removal to this exact stale worktree path; repeatable.",
    )
    parser.add_argument(
        "--force-dirty",
        action="store_true",
        help="Allow removal of stale worktrees that have uncommitted local changes.",
    )
    parser.add_argument(
        "--force-uninspectable",
        action="store_true",
        help="Allow removal of stale worktrees whose broken metadata hides local state.",
    )
    return parser.parse_args()

def main() -> int:
    """Scan, validate against GitLab, display candidates, and optionally remove them."""

    arguments = parse_arguments()
    for executable in ("git", "glab"):
        if shutil.which(executable) is None:
            print(f"missing required executable: {executable}", file=sys.stderr)
            return 1
    search_roots = arguments.root or default_search_roots()
    if not search_roots:
        print("no existing GitLab or Maestro worktree roots to scan", file=sys.stderr)
        return 1

    try:
        worktrees = discover_gitlab_worktrees(search_roots)
        stale_worktrees = [
            worktree
            for worktree in worktrees
            if not gitlab_open_merge_requests(worktree)
        ]
    except (GitLabQueryError, RuntimeError) as error:
        print(f"stale-worktree audit aborted: {error}", file=sys.stderr)
        return 1

    print_worktree_candidates(stale_worktrees)
    selected_paths = {
        worktree_path.resolve(strict=False) for worktree_path in arguments.worktree or []
    }
    if selected_paths:
        known_paths = {worktree.worktree_path.resolve() for worktree in stale_worktrees}
        unknown_paths = selected_paths - known_paths
        if unknown_paths:
            unknown = ", ".join(map(str, sorted(unknown_paths)))
            print(f"requested worktree is not stale: {unknown}", file=sys.stderr)
            return 1
        stale_worktrees = [
            worktree
            for worktree in stale_worktrees
            if worktree.worktree_path.resolve() in selected_paths
        ]
        print(f"Selected stale worktrees for removal: {len(stale_worktrees)}")
    removable_worktrees = selected_stale_worktrees(
        stale_worktrees,
        arguments.force_dirty,
        arguments.force_uninspectable,
    )
    protected_dirty_count = sum(
        worktree.is_dirty is True for worktree in stale_worktrees
    ) - sum(
        worktree.is_dirty is True for worktree in removable_worktrees
    )
    protected_uninspectable_count = sum(
        worktree.is_dirty is None for worktree in stale_worktrees
    ) - sum(
        worktree.is_dirty is None for worktree in removable_worktrees
    )
    if protected_dirty_count:
        print(
            f"{protected_dirty_count} dirty stale worktree(s) are protected; "
            "re-run with --force-dirty after reviewing their changes."
        )
    if protected_uninspectable_count:
        print(
            f"{protected_uninspectable_count} uninspectable stale worktree(s) are "
            "protected; re-run with --force-uninspectable to discard their unknown state."
        )
    if not arguments.apply or not removable_worktrees:
        print("Dry run only. Re-run with --apply to request removal confirmation.")
        return 0

    required_confirmation = f"remove {len(removable_worktrees)}"
    response = input(
        f"Type '{required_confirmation}' to remove the eligible stale worktrees: "
    )
    if response != required_confirmation:
        print("Removal cancelled; no worktrees were changed.")
        return 0

    try:
        remove_stale_worktrees(removable_worktrees)
    except RuntimeError as error:
        print(f"stale-worktree removal stopped: {error}", file=sys.stderr)
        return 1
    print(f"Removed {len(removable_worktrees)} stale GitLab worktrees.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
