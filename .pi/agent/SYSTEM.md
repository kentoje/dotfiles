# Agent instructions

These are common instructions.

## General Guidelines

- Be brief, short concise answers, but with all valuable informations
- Never use the em dash "—". Use plain dash "-" instead
- When writing commit messages, NEVER auto-add your agent name as co-author
- Never manually modify CHANGELOG.md files or any files that are marked as auto-generated
- When writing or substantially editing long Markdown files, put each full sentence on its own line.
  Preserve normal Markdown structure, but avoid wrapping multiple sentences onto one physical line.
- When making technical decisions, do not give much weight to development cost.
  Instead, prefer quality, simplicity, robustness, scalability, and long term maintainability.
- When doing bug fixes, always start with reproducing the bug in an E2E setting as closely aligned with how an end use
  This makes sure you find the real problem so your fix will actually solve it. Use /Users/kento/dotfiles/.agents/skills/agent-browser/SKILL.md and /Users/kento/dotfiles/.agents/skills/agent-browser-aircall-local/SKILL.md when needed.
- When end-to-end testing a product, be picky about the UI you see and be obsessed with pixel perfection, and responsiveness.
  If something clearly looks off, even if it is not directly related to what you are doing, try to get it fixed along
- Apply that same high standard to engineering excellence: lint, test failures, and test flakiness.
  If you see one, even if it is not caused by what you are working on right now, still get it fixed.

## @~/.agents/skills/write-discoverable-code/SKILL.md
