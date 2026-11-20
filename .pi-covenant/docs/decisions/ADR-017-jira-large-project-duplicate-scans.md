# ADR-017 Jira duplicate scans in larger Cloud projects

Conversation Center's Jira project has more than 2,000 visible issues. Keep the exhaustive project scan and exact normalized comparison, including closed issues. Raise the duplicate scan limit to 100 pages per scan. The metadata limit remains 20 pages. Repeated cursors, contradictory results, cancellation and exhausted bounds still block dispatch. Provider visibility and indexing still limit the evidence.

The bound assumes the provider can serve the pages within the existing invocation deadline. The preflight and write models already cover incomplete evidence and changed approval. Page counting and provider pagination are exercised directly through the Jira host port because the bound does not add coordination states to either model.
