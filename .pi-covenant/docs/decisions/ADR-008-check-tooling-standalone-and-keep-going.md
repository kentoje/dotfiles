# Broader checks and optional keep-going

The user requested all three adjustments found during real-repo trials: Knip/setup recognition, standalone check candidates from local CI/instructions, and optional keep-going. Existing fail-fast defaults, nonzero failure semantics, explicit suite precedence and per-project E2E selection remain unchanged. No project code repairs or CI activation are included.

Knip joins Fallow as dead-code checking. Browser install/codegen/helper commands are setup, not E2E test evidence; known setup never enters automatic local selection. UI test commands remain recognizable E2E but not default noninteractive checks.

Static discovery reads bounded local CI script/run entries and repository instructions (including CLAUDE.md). It extracts literal known check invocations, unwraps a simple bash/sh -c/-ac command only for parsing, retains file/line provenance and never executes those shell wrappers. Unknown commands, shell setup, conditionals, substitutions, dynamic arguments and interactive/mutating modes do not become inferred effects. Explicit configurations remain exact. Ordinary supported standalone checks can fill missing local categories; config-bearing compiler commands are validated as local checks before selection, without running the whole build. Discovery does not emulate CI branch/environment policy.

Keep-going is an explicit check option. Failed, unavailable and per-check timed-out results are retained while later required checks are attempted. A host cancellation or absolute deadline stops dispatch. Empty, incomplete or failing suites never pass. CLI and structured reports retain the chosen mode. The default remains stop-on-first-failure.

Before implementation, a new finite mode model checks TruthfulCompletion, NoDispatchAfterCancel and CompleteWhenContinuing. Deliberate faults challenge last-result-wins, dispatch after stop and premature keep-going completion. Original completion and selection models remain regression evidence. Standalone parsing/classification is tested against real fixtures rather than asserted by the abstract model.
