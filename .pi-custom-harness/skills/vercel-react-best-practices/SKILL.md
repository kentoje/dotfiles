---
name: vercel-react-best-practices
description: Reduce avoidable React latency, rendering work, and bundle cost using impact-ranked patterns. Use when implementing or reviewing React components, async data flows, client fetching, re-renders, rendering performance, or JavaScript and bundle optimization.
---

# React performance best practices

Prefer measurable reductions in waterfalls, shipped JavaScript, and unnecessary renders. Preserve behavior and readability; do not add memoization or abstraction without a performance reason.

## 1. Eliminate waterfalls (critical)

- Check cheap synchronous conditions before awaiting remote values.
- Defer `await` into branches that actually need it.
- Run independent operations with `Promise.all()`.
- Model partial dependencies explicitly rather than serializing unrelated work.
- Place Suspense boundaries around independently loading content.

## 2. Reduce bundle cost (critical)

- Import directly from the defining module; avoid broad barrel imports.
- Keep import and file-system paths statically analyzable.
- Lazy-load heavy components with `React.lazy` and Suspense.
- Defer analytics and logging until after hydration.
- Load feature-only modules only when the feature activates.
- Preload likely-next resources on hover or focus when that improves perceived speed.

## 3. Client-side data fetching

- Use the repository's request cache or SWR-equivalent to deduplicate requests.
- Deduplicate global event listeners and mark scroll listeners passive where safe.
- Version and minimize localStorage data; validate persisted values before use.

## 4. Avoid unnecessary re-renders

- Do not subscribe to state used only inside callbacks.
- Extract expensive work into memoized components; hoist non-primitive default props.
- Use primitive effect dependencies and subscribe to derived booleans instead of raw objects.
- Derive state during render rather than mirroring it in an effect.
- Use functional state updates for stable callbacks and lazy initializers for expensive state.
- Do not memoize simple expressions.
- Split hooks with independent dependencies and move interaction logic into event handlers.
- Use `startTransition` or `useDeferredValue` for non-urgent expensive updates.
- Store frequent transient values in refs where they do not affect rendering.
- Never define component functions inside another component.

## 5. Rendering performance

- Animate a wrapper around an SVG rather than repeatedly animating the SVG itself.
- Use `content-visibility` for long, independently viewable lists.
- Hoist static JSX and reduce SVG coordinate precision where it materially reduces output.
- Use Activity/show-hide primitives and ternaries for explicit conditional branches.
- Prefer `useTransition` for pending UI and React DOM resource hints for preloading.
- Mark script loading `defer` or `async` deliberately.

## 6. JavaScript hot paths

- Batch DOM and CSS changes through classes or `cssText`.
- Use `Map`/`Set` for repeated lookups and cache repeated property or function access when profiling supports it.
- Combine compatible filter/map passes when it improves the hot loop; check array length before expensive comparisons.
- Return early, hoist regular expressions, and compute min/max with a loop instead of sorting.
- Use `toSorted()` when immutable sorting is required and defer non-critical work to idle time.

## 7. Advanced patterns

Keep effect-event results out of effect dependency arrays when the API requires it. Use refs for stable event-handler references and initialize app-wide resources once. A `useLatest` helper is appropriate only when the repository already has that convention.

## Review order

Measure or reason from the actual render/data path, then inspect waterfalls, imports, subscriptions, effects, and hot loops in that order. Preserve semantics, accessibility, and cancellation behavior while optimizing.
