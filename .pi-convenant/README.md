# Pi Convenant

Design for standard Pi with custom tools and controls, developed using Covenant. No harness implementation exists yet.

Start with the [behavior catalogue](docs/tool-catalogue.md), [shared protocol](docs/tool-protocol.md), [decisions](docs/open-decisions.md), and [planned acceptance scenarios](docs/acceptance-scenarios.md).

There are 16 components, 129 draft obligations and 39 specified actions. Six global tool definitions cover GitLab, Jira, MR, worktree, fleet and project CLI authoring. Preview and Storybook are optional project CLI capabilities; /ship and /harness-retro are user commands. Supporting context and preflight contracts are not additional public tools.

Native Covenant validation checks contract structure and references. Rich decisions, scenarios, schemas and mutation review plans are design sidecars, not additional native enforcement. verification.yaml bindings remain empty. No passing behavior, mutation run or incident history is claimed.

Do not use implementation code from the former custom harness. Product sessions do not require Covenant, an MR or universal E2E checks. Shipping is explicit; blockers never automatically schedule a new agent turn.

Module interfaces, dependencies and ownership are now explicit in [architecture](architecture/README.md). Run its validator and deliberate-violation suite before implementation and after interface changes. Runtime behavior remains unimplemented.
