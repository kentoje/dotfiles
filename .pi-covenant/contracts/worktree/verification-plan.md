# Worktree executable acceptance checks

The exact native bindings are in verification.yaml. Colocated tests in src/worktree/**/*.test.ts exercise the public module using temporary real Git repositories, controlled setup processes, runtime output schema validation and cancellation signals. All ten obligations now have executable bindings.

The scenario file remains the wider acceptance design. Binding coverage is not proof that every imaginable scenario is covered. The module is not registered with Pi yet; composition and real project setup discovery remain separate modules.
