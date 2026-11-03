# Colocated behavior modules and tests

Status: requested by the user.

Use noun directories with verb implementation filenames: creation/create.ts, inspection/inspect.ts, removal/remove.ts and listing/list.ts. Place tests beside their behavior; put shared fixtures under the module's testing directory. module-port.ts remains the public boundary, with module-port.test.ts for external schema checks. Exported symbols retain domain-specific names for searchability.

All module contracts now declare their source directory as their test root with **/*.test.ts as the discovery pattern. Vitest, Oxlint test overrides, Fallow entrypoints, fault probes and native source ownership follow that convention. The worktree acceptance suite is split by behavior without changing its 22 registered identities or obligation descriptions. Listing is moved out of the public port into its own behavior file without changing its operation interface.

Architecture validation still rejects cross-module internal imports. Historical evidence stays intact; the next full run establishes evidence for the relocated inputs.
