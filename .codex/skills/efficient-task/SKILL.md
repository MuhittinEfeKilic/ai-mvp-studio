---
name: efficient-task
description: Execute normal repository development tasks with minimal context, exploration, tool calls, and change scope. Use when a task should be completed efficiently while preserving existing work and following the repository's AGENTS.md contract.
---

# Efficient Task

Follow the repository's applicable `AGENTS.md` files as the authoritative contract. Resolve conflicts in favor of those instructions.

## Workflow

1. Determine the smallest scope that can satisfy the request before exploring.
2. Inspect only task-relevant files and their directly related tests or configuration.
3. Prefer targeted searches such as `rg` over broad repository scans.
4. Do not reread unchanged files unless new information makes it necessary.
5. Skip generated and runtime directories unless they are directly relevant: `node_modules`, generated project/build outputs, `data`, `work`, `.tool_state`, caches, and logs.
6. Preserve all existing uncommitted user changes.
7. Implement the smallest correct change. Do not refactor unrelated code or introduce speculative abstractions.
8. Run the smallest sufficient verification allowed by `AGENTS.md`. Run full `npm test` only when the affected scope requires it.
9. Stop when the requested task is complete; do not continue with optional cleanup or unrelated investigation.

## Final Response

Keep the handoff concise and include only:

- Files changed
- What changed
- Verification
- Remaining risk
