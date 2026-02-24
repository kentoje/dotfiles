---
name: ui-wip
description: >
  Work-in-progress guide for choosing the right animation type based on
  element state and behavior. Provides a decision flowchart for selecting
  between spring, linear, ease-in-out, and ease-out animations.
---

## How to choose the right animation

```mermaid
flowchart TD
    A[Animation Needed?] -->|no| B[none]
    A -->|yes| C[Has Start and Finish?]

    C -->|yes| D[spring]
    C -->|no| E[Represents Time?]

    E -->|yes| F[linear]
    E -->|no| G[Transitioning?]

    G -->|yes| H[ease-in-out]
    G -->|no| I[Entering?]

    I -->|yes| J[ease-out]
    I -->|no| K[ease-in]

```
