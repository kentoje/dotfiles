# Decisions and remaining project choices

The harness design scope is specified in the [catalogue](tool-catalogue.md) and per-component decisions.yml files.

Confirmed by the user: standard Pi; separate GitLab surface including explicit pipeline retry/cancel; Jira get/search/create/update/comment/transition; fleet status/versions only; explicit retrospective; minimal per-project mandatory check runner first; broad CLI authoring, maintenance and preview/Storybook capabilities deferred; no universal E2E rule; no runtime Covenant gate; no automatic follow-up turn on blockers. Explicit /ship includes commit, push, draft MR creation/reuse, review feedback and CI readiness. It does not merge or deploy.

Authored defaults, open to revision: bounded execution limits in design-defaults.json, command spelling, generated CLI default paths and backlog record format. They are specified sufficiently for implementation but are not represented as user-approved preferences.

Project-specific decisions remain intentionally deferred until discovery: repository identities, Jira site/project/custom fields, setup commands, capability selection, verification commands, preview/auth ownership and CI/readiness policy. Missing prerequisites block that operation with an actionable result; they do not invent a global policy.

Fleet mutations, automatic retrospectives, autonomous blocked-turn continuation, and universal browser checks remain outside this version.

Module interfaces, dependencies and ownership are now explicit in [architecture](../architecture/README.md). Run its validator and deliberate-violation suite before implementation and after interface changes. Worktree implementation is authorized and implemented; project checks are now implemented; other runtime modules remain pending.
