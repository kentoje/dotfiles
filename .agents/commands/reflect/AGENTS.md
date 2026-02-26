---
name: reflect
description: >
  Review completed work and capture reusable learnings in .learnings/ — edge cases, surprises, mistakes, and patterns
---

# Command: /reflect

Review the work you just completed and capture any reusable learnings in `.agents/learnings/`.

## Steps

1. **Read existing learnings.** Scan every file in `.agents/learnings/` so you don't duplicate what's already documented.
2. **Recall what just happened.** Look at the conversation history — what blocks were created, edited, or deleted? What went wrong or was surprising?
3. **Identify new learnings.** A learning is worth writing down when:
   - You hit an unexpected error or edge case.
   - A tool or convention behaved differently than expected.
   - You discovered a pattern that would save time next time.
   - You made a mistake and had to backtrack.
4. **Write one file per learning** in `.agents/learnings/` using a short kebab-case filename that includes a timestamp (e.g. `2026-02-24-1430-carbon-api-gotcha.md`). The format is `YYYY-MM-DD-HHmm-<slug>.md`. Each file should contain:
   - A `#` title summarizing the takeaway.
   - A short paragraph explaining what happened and what to do differently.
5. **If nothing new was learned**, say so and stop. Don't create empty or trivial entries.

## Format

```markdown
# <concise title>

<What happened, why it was surprising, and what to do next time.>
```

Keep each file to 1–4 sentences. These are quick references, not essays.

## Default output directory

Write learnings to `.agents/learnings/` in the current project root (the directory the agent session is running in). Create the directory if it doesn't exist.
