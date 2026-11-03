# Enforced module contracts

The canonical [dependency graph](module-graph.json) and modules/*.json define all 16 owners, exclusive future source/test roots, exact consumed operation allowlists, input/output schemas, state ownership and host capabilities. Native contract.yaml dependencies and interfaces must match these records. Native interface language is the planned TypeScript implementation language; module points to its existing design schema, not a claim that an implementation export exists.

Run from the harness directory:

```sh
uv run --with pyyaml --with jsonschema python scripts/check-module-contracts.py
uv run --with pyyaml --with jsonschema python scripts/test-module-contracts.py
```

The validator rejects graph cycles, missing components, native metadata drift, unknown ports, inconsistent ownership and schema fixture failures. Each operation has accepted and rejected request/result shape fixtures. The negative-check suite deliberately corrupts contracts and adds an illegal future import to demonstrate rejection.

These checks enforce design consistency now. They do not prove provider behavior, user authorization, side-effect safety, or the adequacy of an implementation. Shape fixtures must be supplemented by executable behavioral tests for each obligation before activation. Python dependencies are explicit in the command; no global installation is needed.

During implementation, modules expose only src/<component>/module-port.ts. Cross-module relative imports must target that entrypoint and a declared dependency. The scanner is a limited early check for literal relative JS/TS imports, not a complete language resolver: aliases, dynamic imports and package imports need compiler/linter enforcement when the implementation toolchain is chosen. No runtime source files have been created.

The composition root injects trusted host ports; feature modules cannot import it. Invocation context carries the inherited deadline, cancellation, resource scope and host-derived authorization provenance. Feature modules never receive raw credentials. Pure modules receive no host capabilities. Consumers call only listed operations; read-only consumers cannot borrow write ports.

Jira owns search transport and feeds candidates to pure jira-preflight policy. Project CLI owns the executor primitive; optional preview/story drivers consume it without a reverse dependency. Shipping owns task Git effects and delegates CI/MR/capability work through explicit ports. All side-effecting calls retain committed and unknown effects on cancellation or failure.

Interface changes require an explicit revision, affected consumer fixture updates and a passing full architecture check. A provider/consumer implementation task must include its module JSON, consumed provider schemas, shared protocol, contract obligations and acceptance scenarios. File ownership follows the declared source/test roots. Shared interface changes belong to a coordinated design change rather than a feature agent silently editing another owner's contract.
