# Efficient Task

Use this skill for normal development tasks where minimizing context and token usage is important.

## Goal

Complete the requested task with the smallest necessary amount of repository exploration, tool usage, and output.

## Repository Exploration

- Determine the smallest scope required for the task.
- Prefer Serena symbolic tools for code discovery and navigation.
- Prefer symbol-level inspection over reading entire files.
- Do not scan the whole repository unless the task genuinely requires it.
- Do not explore unrelated directories.
- Do not repeatedly read unchanged files.
- Do not inspect generated files, build output, logs, node_modules, caches, or lockfiles unless directly relevant.
- Prefer targeted search over broad grep or recursive searches.

## External Documentation

- Use the Context7 find-docs skill only when current external library or framework documentation is actually needed.
- Do not fetch documentation for APIs already clear from the local codebase.
- Avoid broad documentation searches.

## Implementation

- Implement the smallest correct solution.
- Do not refactor unrelated code.
- Do not introduce speculative abstractions.
- Do not create helper files unless necessary.
- Reuse existing components and utilities where practical.
- Do not add dependencies unless required.
- Preserve the existing architecture unless the task explicitly requires architectural changes.

## Verification

- Run the smallest relevant verification.
- Prefer targeted tests, type checks, or lint checks over the entire suite.
- Inspect failures, not large successful command outputs.
- Do not run expensive builds repeatedly.
- Do not re-run verification unless code changed or a failure requires it.

## Git

- Inspect only changes relevant to the current task.
- Avoid broad repository-wide diffs when a targeted diff is sufficient.
- Do not modify unrelated working-tree changes.

## Communication

Keep responses concise.

After completing the task, report only:

- files changed
- what changed
- verification result
- any important unresolved issue

Do not narrate routine tool calls or repository exploration.

## Stop Condition

When the requested task is complete and minimally verified, stop.

Do not continue improving unrelated code.