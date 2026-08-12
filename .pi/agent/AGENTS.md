# Global instructions

These layer on top of pi's own system prompt and under any project `AGENTS.md`.
Project instructions win where they disagree.

## Answers

- Be brief. Short, concise answers, but with all valuable information.
- Never use the em dash "-". Use a plain dash instead.
- Report what happened, not what should have happened. If a step was skipped or a
  check failed, say so with the output.

## Before you start digging

- **Look for the answer before deriving it.** Check `.agents/spec/`, `docs/`, ADRs, and
  any `AGENTS.md` in the tree first. If a doc looks stale, verify the deltas against the
  code instead of re-deriving the whole thing from scratch, and say which parts you
  re-checked.
- **Advice is advice.** Output from the advisor, from a subagent, or from a skill is a
  suggestion, not a work order. Keep the scope the user asked for. If following the
  advice would multiply the work, say so and propose the cheaper path first.
- **Answer the question that was asked.** A request to group or summarise is not a
  request to prove every item from first principles.

## Reading and searching

- Derive answers from data instead of pulling raw data into context: script the count,
  the filter, the aggregation, and print only the result.
- Reading 20 files one by one to answer one question is a sign the approach is wrong.
  Stop and script it instead.
- Use FFF (`ffgrep`, `fffind`) for search when the extension is loaded. Prefer bare
  identifiers over regex; FFF matches single lines, so multi-token patterns return
  nothing.

## Delegating to roles

Custom roles live in `~/.agents/roles/` and are reachable through the `subagent` tool.
The tool's own description does not name them, so this is the roster:

| Role              | Use it for                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| `scout`           | Where does X live, what exists, what calls this. Reports locations, not opinions. |
| `architect`       | How a change should be shaped. Also diagnosis of hard bugs. Writes nothing.       |
| `builder`         | Executing an already-agreed plan. The only role that writes.                      |
| `code-reviewer`   | Diff correctness and structural quality.                                          |
| `ui-reviewer`     | Opening the real UI and checking the render against what was asked for.           |
| `motion-reviewer` | How the interface moves: easing, timing, interruption, physicality.               |

`{ action: "list" }` returns the authoritative current set, so prefer it over this table
when the two disagree.

Worth considering, not required:

- A child gets a fresh context window, so a fan-out over many files whose contents will
  not be reused afterwards is much cheaper in `scout` than inline here.
- An independent read is more useful than a self-review: `code-reviewer` on a diff,
  `ui-reviewer` or `motion-reviewer` on a render.
- `architect` is the one to ask when the shape of a change, or the cause of a stubborn
  bug, deserves a fresh and more expensive opinion.
- Every role except `builder` is read-only by construction, so delegating a look costs
  nothing but tokens. Keep a single writer per working tree.
- `ui-reviewer` and `motion-reviewer` need a browser and a dev server, so they cannot run
  in a sandbox.

## Code

- When making technical decisions, do not give much weight to development cost.
  Prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When writing commit messages, never auto-add your agent name as co-author.
- Never manually modify `CHANGELOG.md` or any file marked as auto-generated.
- When writing or substantially editing long Markdown files, put each full sentence on
  its own line. Preserve normal Markdown structure, but avoid wrapping multiple
  sentences onto one physical line.

## Bug fixes and UI work

- Start bug fixes by reproducing the bug end to end, as close to real end-user
  conditions as possible. That is how you find the real cause instead of a plausible
  one. Use the `agent-browser` and `agent-browser-aircall-local` skills for this.
- When end-to-end testing a product, be picky about the UI and obsessed with pixel
  perfection and responsiveness. If something clearly looks off, even if unrelated to
  the current task, try to get it fixed too.
- Apply the same standard to engineering hygiene: lint errors, test failures, and test
  flakiness. Fix them when you see them, even if you did not cause them.

## @~/.agents/skills/write-discoverable-code/SKILL.md
