# Shared tool behavior protocol

Status: specified design; implementation and tests pending.

## Statuses

{
  "ok": "The stated result is complete; a valid empty read or documented no-op can be ok.",
  "partial": "Some named steps succeeded and some did not. Return stable IDs for committed effects.",
  "blocked": "A prerequisite, permission, ambiguity or user decision prevented the next step.",
  "error": "A known operation failure; effects must still be described accurately.",
  "cancelled": "The call stopped on cancellation; already committed effects remain recorded.",
  "indeterminate": "A remote mutation may have committed but no reliable response was obtained; inspect before retrying."
}

## Defaults

{
  "read_attempts": 2,
  "read_deadline_seconds": 30,
  "write_deadline_seconds": 60,
  "page_size": 50,
  "maximum_page_size": 100,
  "log_window_bytes": 65536,
  "maximum_log_window_bytes": 1048576,
  "ship_deadline_minutes": 30,
  "ship_max_fix_rounds": 3,
  "ship_poll_seconds": 15
}

## Decisions

These bounded defaults are authored design choices. They can be changed by explicit host/project configuration; they are not claims of a prior user preference.

## Authorization

The active user task provides authorization. Do not ask again for an already authorized routine operation. No model-provided approval boolean grants permission. A matching duplicate or changed target can require a new user decision.

## Target Resolution

Explicit target and cwd > project declaration > trusted host configuration > current session cwd. Conflicting explicit repository/path inputs block. Resolve remote IDs within their site/repository; never choose the first ambiguous match.

## Cancellation

Stop new steps; terminate only owned subprocesses; do not equate stopping local work with undoing remote work. No cleanup by process name. Mutations already sent retain committed/unknown outcome state.

## Retries

At most one retry of an eligible read within the original deadline. Honor Retry-After only within that deadline. No generic mutation retry, silent timeout extension, background watcher, or autonomous follow-up turn.

## Pagination

One explicit page by default, with cursor/has_more and completeness. Callers may request following pages. Never infer absence from a truncated search, or readiness from an incomplete review/pipeline list.

## Coordination

Serialize or reject conflicting writes by resolved repository/resource identity. Reads and independent targets can run concurrently. Revalidate target/head before the next dependent mutation.

## Diagnostics

Use stable error codes and actionable messages. Preserve IDs, phases, completed steps and bounded output. Redact known configured credentials and auth headers. Unknown secret detection is best-effort, not a security guarantee.

## Trust

Standard Pi permissions and project trust apply. Tools and project commands are trusted executable code; this specification does not create an OS sandbox.

