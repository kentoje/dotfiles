---
name: vercel-composition-patterns
description: Design React component APIs that remain flexible without boolean-prop sprawl. Use when building or refactoring reusable components, compound components, context providers, render APIs, or other component architecture, including React 19 code.
---

# React composition patterns

Use composition to keep component APIs explicit and maintainable. A component with many boolean modes usually wants a better model, not more flags.

## Component architecture

- Avoid boolean props that customize unrelated behavior; compose the desired pieces instead.
- Structure multi-part widgets as compound components with shared context and an explicit assembly surface.
- Use explicit variant components for genuinely different modes rather than one component with a boolean mode matrix.
- Prefer children and named slots for composition over render-callback prop proliferation.

## State management

- Put state management in the provider. Consumers should depend on the provider's interface, not its storage or synchronization mechanism.
- Define a typed context interface with state, actions, and metadata so the provider can change implementation without changing consumers.
- Lift state into the provider when siblings need to coordinate; keep leaf components focused on rendering and events.

## React 19

React 19 APIs are repository-dependent. Follow the local React version and established component conventions before applying a migration rule. In particular, do not remove `forwardRef` merely because a generic React 19 guide suggests it; preserve it when the component library's public API depends on it.

## Decision checklist

1. List the component's stable visual parts and compose them as children or compound members.
2. Separate state ownership from presentation and expose only the context contract consumers need.
3. Replace booleans with explicit variants or slots where modes have distinct semantics.
4. Preserve an escape hatch for unusual content without making the common API a render-prop maze.
5. Check sibling components and real call sites before finalizing names, ownership, and ref behavior.
