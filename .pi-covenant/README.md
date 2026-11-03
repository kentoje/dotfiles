# Pi Covenant

Standard Pi with custom tools and controls, developed using Covenant. Worktree is the first implemented module; Pi registration is pending.

Start with the [behavior catalogue](docs/tool-catalogue.md), [shared protocol](docs/tool-protocol.md), [decisions](docs/open-decisions.md), and [planned acceptance scenarios](docs/acceptance-scenarios.md).

There are 16 components, 10 active worktree obligations, 119 draft obligations and 39 specified actions. Six global tool definitions cover GitLab, Jira, MR, worktree, fleet and project CLI authoring. Preview and Storybook are optional project CLI capabilities; /ship and /harness-retro are user commands. Supporting context and preflight contracts are not additional public tools.

Native Covenant validation checks contract structure and references. Rich decisions, scenarios, schemas and mutation review plans are design sidecars, not additional native enforcement. Worktree has executable verification.yaml bindings. Other components retain empty bindings. See [implemented scope](docs/implemented-features.md) for verification and remaining gaps.

Do not use implementation code from the former custom harness. Product sessions do not require Covenant, an MR or universal E2E checks. Shipping is explicit; blockers never automatically schedule a new agent turn.

Module interfaces, dependencies and ownership are now explicit in [architecture](architecture/README.md). Run its validator and deliberate-violation suite before implementation and after interface changes. Worktree runtime behavior is implemented behind an injected host interface; other modules remain unimplemented.

Bootstrap: `npm ci --ignore-scripts` then `COVENANT_BIN=/path/to/covenant scripts/verify-bootstrap.sh`. Run tests directly with `npm test`.

Quality checks: `npm run check` runs Ultracite with Oxlint/Oxfmt; `npm run fix` applies fixes. `npm run fallow` checks dead code and dependency hygiene, and `npm run fallow:report` runs the combined analysis. The bootstrap script includes the required checks before Covenant verification.
