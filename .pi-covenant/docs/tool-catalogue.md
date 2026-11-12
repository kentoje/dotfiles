# Harness behavior catalogue

Definitions describe public surfaces; worktree and project checks are registered through the standard Pi extension. Shared conventions: [tool protocol](tool-protocol.md).

| Surface | Kind | Actions | Contract |
| --- | --- | --: | --- |
| [gitlab](../tools/gitlab/definition.json) | tool | 8 | [gitlab](../contracts/gitlab/intent.md) |
| [jira](../tools/jira/definition.json) | tool | 6 | [jira](../contracts/jira/intent.md) |
| [mr](../tools/mr/definition.json) | tool | 4 | [mr](../contracts/mr/intent.md) |
| [worktree](../tools/worktree/definition.json) | tool | 4 | [worktree](../contracts/worktree/intent.md) |
| [fleet](../tools/fleet/definition.json) | tool | 2 | [fleet](../contracts/fleet/intent.md) |
| [project_cli](../tools/project_cli/definition.json) | tool | 2 | [project-cli](../contracts/project-cli/intent.md) |
| [preview](../capabilities/preview/definition.json) | project-cli-capability | 2 | [preview](../contracts/preview/intent.md) |
| [story](../capabilities/story/definition.json) | project-cli-capability | 2 | [story](../contracts/story/intent.md) |
| [harness-retro](../commands/harness-retro/definition.json) | user-command | 3 | [retrospective](../contracts/retrospective/intent.md) |
| [ship](../commands/ship/definition.json) | user-command | 1 | [shipping](../contracts/shipping/intent.md) |
| [repository-context](../contracts/repository-context/definition.json) | shared-component | 1 | [repository-context](../contracts/repository-context/intent.md) |
| [mr-guard](../contracts/mr-guard/definition.json) | preflight | 1 | [mr-guard](../contracts/mr-guard/intent.md) |
| [jira-preflight](../contracts/jira-preflight/definition.json) | preflight | 1 | [jira-preflight](../contracts/jira-preflight/intent.md) |
| [foundation](../contracts/foundation/definition.json) | development-contract | 0 | [foundation](../contracts/foundation/intent.md) |
| [development-method](../contracts/development-method/definition.json) | development-contract | 0 | [development-method](../contracts/development-method/intent.md) |
| [tool-protocol](../contracts/tool-protocol/definition.json) | development-contract | 0 | [tool-protocol](../contracts/tool-protocol/intent.md) |

16 components; 36 active obligations (ten worktree, four development tooling, fourteen project checks, six foundation and two local context) and 122 draft obligations; 37 specified actions; 256 planned acceptance records (including obligation review records). Worktree, development tooling and project checks have executable acceptance. Other component examples remain planned. See implemented-features.md.
