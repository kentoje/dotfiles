# Acceptance implementation plan

No executable bindings exist. scenarios.yml contains planned examples, not passing evidence.

Use deterministic adapter fixtures for service results, temporary Git repositories for filesystem behavior, controlled subprocesses for ownership/cancellation, and host-level integration checks for registration and commands. Each native obligation must gain a meaningful executable assertion before activation.

- GL-REPO-01: Return team/app and develop with no local or remote mutation.
- GL-REPO-02: Return blocked AMBIGUOUS_REMOTE; do not choose the first remote.
- GL-LIST-01: Return newest first, has_more=true and next cursor; complete=false.
- GL-LIST-02: Return error, not an empty successful list.
- GL-PIPE-01: Return B/running, never A/success.
- GL-PIPE-02: Return not found; do not cross-project search or substitution.
- GL-JOBS-01: Default returns current attempts; explicit history retains both distinct IDs.
- GL-JOBS-02: complete=false; no pipeline readiness assertion.
- GL-JOB-01: Return the old attempt as old; do not replace it with 9.
- GL-JOB-02: Return bounded failure after eligible read retry, not success or absence.
- GL-LOG-01: Return a bounded window, truncated=true and a valid continuation offset.
- GL-LOG-02: Token is redacted; original credential never appears in diagnostics.
- GL-RETRY-01: One retry request targets 42; return its observed state without claiming green CI.
- GL-RETRY-02: Return indeterminate; do not issue a second retry.
- GL-RETRY-03: Return ok/no_change rather than inventing a new pipeline.
- GL-CANCEL-01: accepted with cancellation_confirmed=false and actual observed state.
- GL-CANCEL-02: Return no_change; do not claim it transitioned to canceled.
- GITLAB-001-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-002-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-003-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-004-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-005-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-006-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-007-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-008-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-009-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
- GITLAB-010-ACCEPTANCE: Observe the required behavior and prove the forbidden side effect did not occur; retain target identities and effects in diagnostics.
