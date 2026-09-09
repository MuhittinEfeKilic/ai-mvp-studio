# Claude Code Instructions

Follow `AGENTS.md` as the authoritative project-wide agent contract.

## Context Efficiency

- Prefer Serena symbolic tools for code discovery and navigation.
- Read only the files and symbols needed for the current task.
- Do not scan the entire repository unless necessary.
- Do not repeatedly read unchanged files.
- Prefer targeted searches and symbol-level reads over complete file reads.
- Use Context7 only when current external documentation is required.
- Avoid `node_modules`, generated output, logs, caches, and lockfiles unless directly relevant.

## Scope

- Implement the smallest correct change.
- Do not refactor unrelated code.
- Do not introduce speculative abstractions.
- Preserve existing working-tree changes.

## Verification

Follow the verification requirements in `AGENTS.md`, using the smallest sufficient verification allowed by those rules.

## Communication

Keep final responses concise:

- files changed
- what changed
- verification
- remaining risk

Stop when the requested task is complete.
