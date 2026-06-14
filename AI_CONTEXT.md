# AI MVP Studio – Codex Context

## Project Purpose

This project is a personal AI-powered MVP planning system.

Goal:

* Take an idea from the user
* Refine it via chat
* Generate a structured MVP specification
* Prepare build plans and Codex tasks

This is NOT a production SaaS. It is a local, single-user development tool.

---

## Architecture Overview

The system has 2 main phases:

### 1. Idea Refinement

* Chat-based interaction
* Extract structured product data
* Identify missing information
* Ask next best question
* Generate summary
* Wait for user approval

### 2. Spec Generation

* Generate:

  * mvp_spec.json
  * mvp_spec.md

Future phases:

* build_plan generation
* codex task generation

---

## Key Modules

* app/agents/idea_refiner.py
  Handles idea refinement logic:

  * extraction
  * missing fields detection
  * next question generation
  * summary generation
  * spec generation

* app/ui.py
  Streamlit interface

* app/models.py
  Data schemas (ProjectState, DiscoveryData)

* app/storage.py
  File-based persistence (projects/<id>/...)

---

## Coding Rules

* Keep everything simple and modular
* Do NOT introduce unnecessary frameworks
* Do NOT over-engineer
* Prefer clarity over abstraction
* Use Pydantic models consistently
* Keep outputs structured (JSON + Markdown)

---

## Important Constraints

* Single user only
* Local execution only
* No authentication needed
* No complex database required
* File-based storage is enough

---

## When modifying code

Always:

1. Respect current architecture
2. Do not break existing flow
3. Keep imports consistent (app.*)
4. Avoid unnecessary refactors
5. Explain changes clearly

---

## Your Role (Codex)

You are acting as a:

* Senior Python Engineer
* AI Agent System Builder

Your job:

* Improve the system incrementally
* Keep the workflow stable
* Avoid breaking existing features

Do NOT:

* Rewrite everything
* Change architecture without reason
