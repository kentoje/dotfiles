# ADR-014 Merge requests and creation guard

The public `mr` tool acts on existing GitLab merge requests. Implicit selection uses a complete same-project open-branch lookup. Status derives unresolved feedback from complete consistent discussion pages and compares the observed pipeline SHA with the selected MR head. Discussion entries retain the original note body and stable thread identity. The existing schema exposes the leading discussion note; replies remain on GitLab.

The write adapter uses trusted Pi confirmation and sends only a fixed existing-MR update, discussion reply or explicit resolution. Reply confirmation covers both requested phases. A known reply ID survives a later resolution failure. Unknown reply delivery never triggers a resolution or retry. Metadata updates send only supplied changed fields and read the target again after acknowledgement. Concurrent writes to one MR in one Pi tool instance are blocked.

The internal creation guard makes a read-only allow, reuse or block decision for the exact target and source branch. It uses the MR status selection seam, with an explicitly bound source branch, and the existing bounded GitLab lookup. Policy is keyed to the resolved repository and supplied only by the trusted host. Native ship writes remain for the shipping module.

With explicit host opt-in, a Pi Bash pre-tool hook covers literal `glab mr create` and `glab mr new`, optionally preceded by one literal `cd PATH &&`. Direct commands use explicit repository, source, target and title arguments so glab cannot silently infer another target. Unsupported syntax on a recognized creation command is blocked. Shell aliases, scripts, arbitrary API calls and user-terminal commands are outside this hook. No agent completion or continuation event is registered.

Finite models cover explicit creation context, complete absence and duplicate reuse, as well as bound reply dispatch, optional ordered resolution and partial completion. Real Git, HTTP and Pi fixtures exercise decoding, configuration and command grammar. Models describe one invocation and assume provider observations are valid within that invocation; other clients and server indexing can race those observations.

Before implementation, Covenant fully explored 15 reply states and nine guard states. Four deliberate faults were detected in each model, in runs `1795102812337053000-71835` and `1795102814254137000-71870`.
