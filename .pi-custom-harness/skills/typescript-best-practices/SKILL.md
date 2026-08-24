---
name: typescript-best-practices
description: Keep TypeScript contracts narrow, validated, and exhaustive. Use when reading, writing, reviewing, or refactoring `.ts` and `.tsx` code, especially at external-data boundaries.
---

# TypeScript best practices

Use the type system to make invalid states difficult to represent and to make boundary failures explicit.

| Rule | Summary |
|------|---------|
| Discriminated unions | Model variants with a `kind` literal discriminant; avoid optional-field bags. |
| Branded types | Brand primitive identifiers with `& { readonly __brand: "X" }`; validate once at creation. |
| `unknown` over `any` | Treat external data as `unknown`; `any` disables checking everywhere it spreads. |
| No unchecked casts | Do not use `as` to silence the compiler. Validate first, or improve the type. |
| Narrowing hierarchy | Prefer discriminant switch, then `in`, `typeof`/`instanceof`, a truthful type guard, and a cast only as a last resort after validation. |
| Truthful guards | A guard must check the claim it makes; name guards `isX` or `hasX`. |
| Exhaustiveness | In a default switch arm, assign the remaining value to `never` so new variants fail compilation. |
| `satisfies` over `as` | Validate an object against a contract without widening its literal types. |
| Boundary validation | Parse and validate where data enters; trust the resulting type internally and do not repeatedly revalidate. |
| Derived types | Prefer `Pick`, `Omit`, `Parameters`, `ReturnType`, `Awaited`, and `typeof` over duplicating a schema-defined shape. |
| Object arguments | Pass an object for ordinary APIs so argument meaning is self-documenting. Skip this on hot paths such as per-frame rendering, tokenizers, and parsers. |

## Boundary checklist

External data includes JSON, RPC payloads, `postMessage`, IPC, file contents, environment variables, and database results. Accept it as `unknown`, validate every required field, and return a typed value or a clear error. Persisted JSON needs versioning and a guarded parse. Do not let loose boundary objects leak through the rest of the program.

## Exhaustive switch

```ts
function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rect":
      return shape.width * shape.height;
    default: {
      const exhaustive: never = shape;
      return exhaustive;
    }
  }
}
```

## Practical review order

1. Look for impossible combinations and introduce a discriminant.
2. Replace `any` and unchecked external values with `unknown` plus validation.
3. Fix type inference with narrower inputs, derived types, or `satisfies` before considering a cast.
4. Check every variant switch for exhaustiveness.
5. Confirm branded IDs and object arguments prevent plausible caller mistakes without adding allocations to hot paths.
