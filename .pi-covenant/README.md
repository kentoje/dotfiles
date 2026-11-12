# Pi Covenant

Standard Pi with custom tools and controls, developed using Covenant. Worktree and project checks are registered through a standard Pi extension, with local repository context and explicit host worktree configuration. See [Pi setup](docs/pi-integration.md).

Start with the [behavior catalogue](docs/tool-catalogue.md), [shared protocol](docs/tool-protocol.md), [decisions](docs/open-decisions.md), and [planned acceptance scenarios](docs/acceptance-scenarios.md).

There are 16 components, 36 active obligations (ten worktree, four development tooling, fourteen project checks, six foundation and two local context), 122 draft obligations and 37 specified actions. Six global tool definitions cover GitLab, Jira, MR, worktree, fleet and project checks. Preview, Storybook and broad CLI authoring are deferred; /ship and /harness-retro are user commands. Supporting context and preflight contracts are not additional public tools.

Native Covenant validation checks contract structure and references. Rich decisions, scenarios, schemas and mutation review plans are design sidecars, not additional native enforcement. Worktree, project checks, development tooling, foundation integration and local context have executable verification.yaml bindings. Other components retain empty bindings. See [implemented scope](docs/implemented-features.md) for verification and remaining gaps.

Do not use implementation code from the former custom harness. Product sessions do not require Covenant, an MR or universal E2E checks. Shipping is explicit; blockers never automatically schedule a new agent turn.

Module interfaces, dependencies and ownership are now explicit in [architecture](architecture/README.md). Run its validator and deliberate-violation suite before implementation and after interface changes. Worktree uses an injected host interface; project checks run existing repo commands. Foundation supplies the Pi adapters and repository-context supplies local metadata resolution. Service modules remain unimplemented.

Bootstrap: `pnpm install --frozen-lockfile` then `COVENANT_BIN=/path/to/covenant scripts/verify-bootstrap.sh`. Run tests directly with `pnpm test`.

Quality checks: `pnpm check` runs the complete local verification pipeline; `pnpm check:quality` runs Ultracite with Oxlint/Oxfmt; `pnpm fix` applies fixes. `pnpm fallow` checks dead code and dependency hygiene, and `pnpm fallow:report` runs the combined analysis. The bootstrap script includes the required checks before Covenant verification.

Inspect discovered checks with `pnpm project inspect --project /path/to/repo --json`. Project checks: `pnpm project check --project /path/to/repo` runs the minimal required suite; add `--json` for structured results. See [configuration and scope](src/project-cli/README.md). It does not require Covenant or TLA+ at runtime.
