# ADR-013 Jira Cloud and duplicate preflight

Jira owns its six public actions. Foundation owns fixed Jira Cloud REST v3 routes, credentials, deadlines and trusted Pi confirmations. Jira preflight is a pure, internal port. A headless Pi session can read and search. Mutations require interactive confirmation of the exact target and provider fields.

The create caller scans visible issues in the selected project, including closed issues. An exhaustive bounded query avoids treating full-text search as an exact match filter. Incomplete scans block creation. Matching applies Unicode NFKC, whitespace collapse, trimming and lowercase. The proposal fingerprint covers site, project, type, summary and the displayed exact matches including state. After approval, Jira scans again and requires the same fingerprint. This does not provide distributed locking or visibility of private issues. No heuristic suggestions are generated in this slice.

The finite models cover preflight completeness, changed duplicate evidence, authorization, single dispatch and truthful mutation outcomes. Each models one invocation. Executable checks cover field resolution, provider responses, JQL and actual Pi/HTTP wiring. The model artifacts are development inputs only.

Before implementation, Covenant fully explored 8 preflight states and 13 mutation states. It caught two preflight faults and three mutation faults in runs `1795098913030297000-72471` and `1795098914778606000-72640`.

Pi blocks competing writes per site and issue or create project for the lifetime of one invocation. The loopback acceptance test exercises this behavior. Create metadata and visible-project search use at most 20 pages per collection. Authentication uses one configured Cloud origin, an account email and an absolute token file.
