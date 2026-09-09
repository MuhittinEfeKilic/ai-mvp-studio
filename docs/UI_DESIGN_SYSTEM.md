```
# AI MVP Studio — UI Design System## 1. PurposeThis document is the visual and interaction source of truth for the AI MVP Studio local web interface.AI MVP Studio is a personal operational tool used to turn a project specification into a completed application with minimal manual intervention.The UI should help answer three questions quickly:1. What is happening right now?2. Is anything blocking the project?3. What should I do next?The interface is not intended to be:- a marketing website,- a consumer SaaS dashboard,- a visually experimental product,- or a generic AI chat interface.It should feel like a focused engineering control panel.---## 2. Product CharacterThe visual character should be:- dark-first,- technical,- calm,- compact,- professional,- low-clutter,- information-dense without feeling crowded,- operational rather than decorative.Reference feeling:- Linear- GitHub Actions- Vercel- Raycast- modern developer toolingDo not copy these products directly.Use them only as references for clarity, hierarchy and restraint.---## 3. Core Design Principles### 3.1 Status before metricsThe user should understand the current project state before seeing detailed metrics.Priority order:1. Current project status2. Blocking issue / required action3. Primary action4. Pipeline progress5. Validation state6. Important metrics7. Technical detail8. Raw diagnosticsDo not allow token usage, paths, hashes or agent statistics to visually compete with a blocker or required action.---### 3.2 Progressive disclosureTechnical information must remain accessible, but not everything should be visible at once.Primary screens should show concise summaries.Detailed information should use:- expandable sections,- disclosure rows,- secondary panels,- tabs,- tooltips where appropriate.Examples of information that should usually remain secondary:- raw filesystem paths,- SHA-256 values,- long acceptance evidence,- complete event payloads,- low-level process diagnostics,- per-agent token details,- housekeeping internals.---### 3.3 One primary actionEach project state should normally expose one visually dominant action.Examples:- Continue- Retry Device Validation- Accept Project- Run Release Readiness- Download APKSecondary actions should not visually compete with the primary action.Avoid multiple equally prominent filled buttons.---### 3.4 Semantic consistencyThe same state must always have the same:- wording,- icon,- color,- badge treatment,- visual priority.Do not use multiple terms for the same state unless they represent genuinely different meanings.---## 4. ThemeAI MVP Studio is dark-theme first.Do not introduce a light theme unless explicitly requested later.### 4.1 Base palette#### Backgrounds```textApp background:      #0D0F12Sidebar:             #101318Panel background:    #12161CElevated surface:    #171C23Hover surface:       #1C222BBorder:              #272E38Strong border:       #343D49
```

Avoid pure black except where necessary.

#### Text

```
Primary text:        #F3F4F6Secondary text:      #A7AFBAMuted text:          #737D89Disabled text:       #535C67
```

#### Semantic colors

Use semantic colors sparingly.

```
Success / Ready:     greenRunning / Info:      blueWaiting / Warning:   amberBlocked / Failed:    redNeutral / Skipped:   gray
```

Do not color large backgrounds unless immediate attention is required.

Prefer:

- small status dot,
- badge,
- left border,
- compact icon,
- small text accent.

---

## 5. Typography

Use the existing system sans-serif stack where practical.

The interface should feel compact.

Avoid:

- oversized headings,
- decorative fonts,
- excessive bold text.

Recommended hierarchy:

```
Page title:          20–24 px / semiboldSection title:       13–15 px / semiboldPrimary value:       18–22 px / semiboldBody:                13–14 pxSecondary text:      12–13 pxMetadata:            11–12 px
```

Use monospace only for:

- IDs,
- paths,
- hashes,
- commands,
- raw technical output,
- selected technical metrics where it improves scanning.

Do not use monospace for normal UI labels.

---

## 6. Spacing

Use a consistent 4 / 8 px spacing scale.

Preferred values:

```
4 px8 px12 px16 px24 px32 px
```

Avoid arbitrary spacing.

Cards should generally use:

```
12–16 px vertical padding14–18 px horizontal padding
```

Dense tables may use less.

---

## 7. Borders and Radius

The interface should be structured primarily through subtle borders and spacing.

Recommended:

```
Card radius:         8 pxButton radius:       6–8 pxBadge radius:        4–6 pxBorder width:        1 px
```

Avoid:

- large pill-shaped cards,
- exaggerated rounding,
- strong drop shadows.

Shadows should normally not be required in the dark theme.

---

## 8. Main Application Layout

The current high-level layout should remain recognizable:

```
┌─────────────────────────────────────────────┐│ Top Bar                                     │├─────────────┬───────────────────────────────┤│ Projects    │ Project Workspace             ││ Sidebar     │                               ││             │                               │└─────────────┴───────────────────────────────┘
```

Do not redesign the application into a completely different navigation model without a strong functional reason.

The current structure is considered correct.

The main redesign focus is information hierarchy inside the project workspace.

---

## 9. Top Bar

The top bar should remain minimal.

It should contain:

- AI MVP Studio identity,
- Codex/system availability indicator,
- global New Project action.

Avoid adding project-specific metrics to the global header.

The New Project action may be visually prominent, but should not overpower the current project workflow.

---

## 10. Project Sidebar

The sidebar is a compact project navigator.

Each project row should communicate:

- project name,
- state,
- optionally a short ID or secondary metadata.

Use a small semantic status indicator.

Example:

```
● Akış Cep  Device waiting
```

Avoid displaying too much metadata in each row.

Project ID should remain secondary.

### Selected state

Selected project should be communicated using:

- slightly elevated background,
- left indicator or stronger border,
- brighter project name.

Do not rely only on color.

---

## 11. Project Header

Every project screen begins with a consistent project header.

Recommended hierarchy:

```
Akış Cep                         [Primary Action]Device validation waiting        [Secondary Action]project-idrepository path
```

Long filesystem paths should not dominate the header.

Prefer:

- truncated path,
- copy action,
- tooltip or expanded value on demand.

The user should first see the project state, not the filesystem location.

---

## 12. Project Navigation

Preferred project-level navigation:

```
GenelÇalışmaDoğrulamaEtkinlik
```

Equivalent conceptual names:

```
OverviewExecutionValidationActivity
```

### Genel

Purpose:

> What is the state of this MVP right now?

Contains:

- current project status,
- required action,
- blocker/warning summary,
- task progress,
- wall-clock time,
- high-level token usage,
- high-level pipeline summary.

Avoid detailed per-agent statistics here.

### Çalışma

Purpose:

> How is the work being executed?

Contains:

- current/recent agents,
- task graph or task list,
- concurrency,
- role timing,
- token usage by role,
- agent runs,
- execution timeline.

### Doğrulama

Purpose:

> Did the generated application satisfy its requirements?

Contains:

- quality gate,
- device gate,
- acceptance criteria,
- release readiness,
- housekeeping status,
- validation warnings.

Validation is different from execution and should remain visually separate.

### Etkinlik

Purpose:

> What happened chronologically?

Contains:

- raw event history,
- process events,
- retries,
- repair events,
- state changes.

This is the lowest-level operational view.

---

## 13. General Screen Hierarchy

The General screen should use this order.

### 13.1 Current state

Top section:

```
Current StatusDevice validation waitingProduct validation passed, but device validation requires attention.[Retry Device Test]
```

The current state should be understandable without inspecting any other section.

### 13.2 Blocking issue / required action

Only show this prominently when intervention is required.

Recommended structure:

```
⚠ Device validation requires attentionThe application itself passed the executed device flows.The Android runtime cleanup could not be completed.Recommended action:Retry device validation.
```

Avoid showing the same error separately in several visually equal places.

Detailed diagnostic information belongs in Validation or Activity.

### 13.3 Pipeline summary

Use a compact summary.

Example:

```
Implementation      PASSQuality             PASSDevice              WAITINGAcceptance          10/10Release             NOT RUN
```

Do not render every internal stage as a large card.

### 13.4 Primary project metrics

Only show metrics that help understand overall project progress.

Recommended:

- Tasks completed
- Wall-clock duration
- Token budget used
- Peak concurrency or agent activity

Avoid placing detailed input/output token breakdown here.

---

## 14. Execution Screen

The Execution screen may be information dense.

Recommended top summary:

```
Runs                25Wall time           40mAgent busy time     56mPeak concurrency    4
```

Then show:

1. active agents,
2. execution/task timeline,
3. role breakdown,
4. token breakdown,
5. individual runs.

If no agent is active, do not use a large empty panel.

Preferred:

```
No agents currently running.Last activity 2m ago.
```

---

## 15. Validation Screen

This screen should group results by type.

Recommended order:

```
QualityDeviceAcceptanceRelease ReadinessHousekeeping
```

Each section should have:

- status,
- concise explanation,
- drill-down details.

### 15.1 Quality Gate

Show a compact list:

```
Analyze       PASSTests         PASSAPK build     PASSDiagnostics   PASS
```

Successful rows should remain visually quiet.

Failures should naturally attract attention.

### 15.2 Device Gate

Separate product validation from environment housekeeping.

Example:

```
Device validation    PASSFlow coverage        PASSStorage              PASSIntegration tests    PASSAPK install          PASSApp launch           PASS
```

Then separately:

```
HousekeepingAVD wipe             SKIPPEDReason: Current target is a third-party Android emulator.
```

Housekeeping must never visually look like a failed product validation when product validation passed.

### 15.3 Acceptance Criteria

Acceptance criteria may become long.

Show:

```
Acceptance Criteria        10 / 10 PASS
```

Then collapsed rows:

```
AC1  PASS  Create daily planAC2  PASS  Edit routineAC3  PASS  ...
```

Expand a row to show evidence.

Avoid showing long source paths by default.

### 15.4 Application Completeness

Application Completeness belongs in Validation because it answers whether the generated application feels functionally complete relative to its specification.

When this capability exists, it should summarize areas such as:

- feature completeness,
- acceptance coverage,
- dead-end navigation,
- unfinished placeholders or template content,
- missing loading / empty / error states,
- inactive controls,
- form validation,
- required persistence or integration behavior.

Do not present speculative completeness data before the capability is implemented.

The section should remain concise by default and expose evidence through drill-down details.

### 15.5 Release Readiness

Display:

```
Release Readiness      READYcom.example.app1.0.0+155.8 MBWarnings: 2
```

Detailed SHA-256, signing state and artifact path should be expandable.

Clearly distinguish:

```
READY for sideload testing
```

from:

```
Store distribution verified
```

Do not imply Play Store readiness unless it is actually verified.

---

## 16. Status Components

Create reusable visual semantics for statuses.

Suggested statuses:

```
RUNNINGPASSREADYWAITINGWARNINGBLOCKEDFAILEDSKIPPEDACCEPTEDNOT RUN
```

Each status should have one consistent badge treatment.

Example:

```
● PASS● WAITING● FAILED
```

Do not mix unrelated styles for the same state.

---

## 17. Buttons

### Primary button

Only one per primary context.

Use for the next recommended action.

Examples:

```
ContinueRetry Device TestRun Release ReadinessAccept Project
```

### Secondary

Use for:

```
Download APKOpen FolderView ReportCopy Path
```

### Danger

Use only for destructive actions.

Examples:

```
Delete ProjectReset Project
```

Do not use warning colors simply because an action relates to a warning.

---

## 18. Cards

Cards should exist only when grouping genuinely related information.

Avoid nested card structures.

Avoid turning every metric into a large card.

Prefer one coherent surface with clear internal sections where appropriate.

---

## 19. Tables

Tables should be dense and readable.

Guidelines:

- compact row height,
- subtle row separators,
- muted headers,
- consistent numeric alignment,
- monospace for IDs/tokens only where useful,
- avoid vertical borders,
- use subtle hover state for scanability.

---

## 20. Empty States

Empty states should be small and informative.

Bad:

```
[large empty bordered rectangle]No agents.
```

Preferred:

```
No agents currently running.Completed runs remain available below.
```

Do not give empty content the same visual weight as active information.

---

## 21. Error Presentation

Errors should distinguish between three categories.

### Product failure

The generated application itself failed validation.

Example:

```
Application launch failed.
```

### Environment failure

Studio infrastructure or test environment failed.

Example:

```
Android runtime unavailable.
```

### Housekeeping warning

Cleanup failed but application validation remains valid.

Example:

```
AVD cleanup could not be completed.
```

These categories must not use identical visual presentation.

---

## 22. Tooltips and Technical Values

Use tooltips or expandable values for:

- truncated paths,
- hashes,
- IDs,
- exact token values,
- diagnostic codes.

Where useful, provide a copy button.

Do not display full hashes prominently.

Example:

```
b382a7a1…0010   [Copy]
```

---

## 23. Animations

Animations should be minimal.

Allowed:

- subtle hover transitions,
- status transitions,
- collapsible section animation,
- lightweight running indicator.

Avoid:

- animated gradients,
- glowing borders,
- floating elements,
- decorative motion,
- constant pulsing.

The interface should remain calm while multiple agents are running.

---

## 24. Loading States

Do not replace large areas with generic spinners.

Prefer preserving layout and showing:

```
Running…
```

Running processes should communicate:

- current stage,
- elapsed time if available,
- whether user action is required.

---

## 25. Responsive Scope

Primary target:

```
Desktop1366 px and wider
```

AI MVP Studio is primarily a local desktop development tool.

Support narrower windows reasonably, but mobile-first design is not required.

At smaller widths:

- collapse secondary metrics,
- allow tables to scroll,
- preserve project status and primary action.

---

## 26. Accessibility

Maintain sufficient contrast.

Do not rely only on color for status.

Use combinations of:

- icon,
- label,
- color.

Interactive elements should have visible hover and focus states.

---

## 27. What Not To Do

Do not introduce:

- heavy gradients,
- glassmorphism,
- neon cyberpunk visuals,
- oversized dashboard cards,
- excessive rounded pills,
- excessive shadows,
- decorative charts with no operational value,
- meaningless statistics,
- chatbot-style interfaces for normal project operations,
- animations simply to make the UI appear AI-powered.

Avoid generic AI-generated dashboard aesthetics.

---

## 28. Information Value Rule

Before displaying any value prominently, ask:

> Does this help the user understand project state, diagnose a problem or decide what to do next?

If not, reduce its visual priority or move it into a detailed view.

---

## 29. Feature Addition Rule

Whenever a new AI MVP Studio capability is added, do not simply append another card to the General screen.

Determine which domain it belongs to:

```
ExecutionValidationReleaseActivity
```

Then integrate it into the existing information hierarchy.

The UI must remain understandable as the system grows.

---

## 30. Implementation Rule for AI Coding Agents

Before modifying UI code, an AI agent must:

1. read this file,
2. inspect the existing UI,
3. preserve current functionality,
4. identify the information hierarchy affected,
5. reuse existing visual components where practical,
6. avoid introducing isolated one-off styles.

After modifying the interface, the agent should verify:

- project states remain understandable,
- primary actions remain available,
- successful, failed, waiting and running states render correctly,
- long data does not break the layout,
- new features follow this design system.

---

## 31. Layout Strategy

The existing global application layout should be preserved.

Do not replace the current:

```
Top Bar+ Project Sidebar+ Project Workspace
```

structure unless a concrete usability problem requires it.

The redesign priority is internal project-workspace organization rather than global navigation replacement.

For project screens:

- use full workspace width when data density requires it,
- avoid unnecessary multi-column layouts on General,
- use two-column layouts only where comparison or dense validation data benefits from it,
- keep main readable content visually centered within very wide screens,
- allow dense tables and execution timelines to use more horizontal space.

---

## 32. Current Redesign Priority

UI development should happen incrementally in this order:

1. Project General screen
2. Validation screen
3. Execution screen
4. Project sidebar
5. Activity/log presentation
6. New Project flow

Do not redesign all areas in one large change.

Each step should be independently reviewable and reversible.
