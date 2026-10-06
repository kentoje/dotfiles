---
name: jev-agent-browser
description: >
  Drive a multi-step goal on an already-open agent-browser session with Jev
  (TypeSafe), using this skill's own runner. Use when the user asks for Jev,
  or a faster way to fill, filter, or click through the current agent-browser
  page. Not for one click, screenshots, uploads, drag, hover, frames, or
  shadow DOM. Do not use browser-use or jev-ultrafast.
---

# Jev on the open agent-browser session

This skill owns the loop. `scripts/observe.js` reads the page. `scripts/run.py`
asks TypeSafe which action to take, then executes it through `agent-browser`.
Do not import browser-use, browser-harness, or the jev-ultrafast checkout.

Do not drive the loop yourself with `snapshot` and `click`. That puts a
coding-agent turn between every action and throws away the speed.

## When

Use for a multi-step goal on the current page: fill a form, apply filters, click
through a flow.

Do not use for one click, a screenshot, an upload, a drag, a hover-only control,
a frame, or a shadow root. Use `agent-browser` for those. If the hostname
contains `aircall`, auth and open with `agent-browser-aircall-local` first.

The runner can `CLICK`, `TYPE_TEXT`, native `SELECT`, `SCROLL`, and `WAIT`. It
has no submit operation. A form commits only by clicking the control whose
`commit` is `submit`. Back, Close, and Cancel leave or discard unless the goal
asks for that. Duplicate labels are split by `container` (`dialog`, `form`,
`page`) and `commit`. If a layer covers the target so `elementFromPoint` misses
it, the runner re-observes, then `blocked`. A click on a control inside that
layer is not a covered-target failure.

The goal must not name a leave or discard control as the way to commit. Name
the effect, not a guessed button label.

## Before

The session must already be on the page, past login. Do not start against
`about:blank` or a login wall.

```bash
agent-browser --session <NAME> get url
```

While the runner is alive, issue no other `agent-browser` command on that
session. Two clients on one tab race.

## Run

```bash
python3 ~/.agents/skills/jev-agent-browser/scripts/run.py \
  --session <NAME> \
  --goal '<one natural-language goal>'
```

`<NAME>` is the live session (`aircall-local`, or the worker name). The goal is
the whole task, not a step list. Needs `TYPESAFE_API_KEY` and `LLM_GATEWAY_KEY`
in the environment. The gateway writes field values; Jev only chooses the field.
Optional: `TYPESAFE_MODEL` (default `jev-latest`), `TEXT_MODEL` (default
`openai/gpt-6-luna` at low effort), `LLM_GATEWAY_BASE_URL`.

The runner prints one JSON object and leaves the tab open. It does not launch
Chrome, navigate, or resize the window.

## After

`status: done` is the model's claim, not proof. Re-snapshot and check the
outcome the goal asked for:

```bash
agent-browser --session <NAME> snapshot -i
```

`blocked` or `error`: read `steps` and `error`, then finish that one stuck step
with normal `agent-browser` commands. A repeated fill or click blocks the run
even when the page text changes. Do not immediately re-run the same goal. Do
not close the session unless the user asked.
