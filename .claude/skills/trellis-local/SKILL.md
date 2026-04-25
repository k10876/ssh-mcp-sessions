---
name: trellis-local
description: Use when working in this repository and needing the project-local Trellis customizations that extend the default workflow and shared guides.
---

# Trellis Local Customizations

## Overview

Project-local Trellis guidance adds three default process expectations: use TDD for behavior changes when tests are feasible, use git worktrees when implementation needs isolation from the current working tree, and choose model strength to match the task.

## Self-Iteration Protocol

1. Read the current Trellis docs before editing them.
2. Keep changes focused on project-local behavior, not generic manifesto text.
3. Update both the shared guide index and the workflow when adding a new first-class process rule.
4. Record the customization here so future edits have a local source of truth.
5. Review the final wording for consistency with the existing Trellis voice.

## Specs Customized

### 2026-04-25

- `.trellis/spec/guides/index.md`
  - Added shared-guide entries for TDD and worktree usage.
  - Added concise trigger checklists for when each guide should be consulted.
- `.trellis/spec/guides/test-driven-development-guide.md`
  - Added a concise shared guide that makes red-green-refactor the default loop.
  - Requires starting with a failing test for behavior changes when tests are feasible.
  - Tells agents to ask the human before exempting work from TDD.
- `.trellis/spec/guides/worktree-usage-guide.md`
  - Added a shared guide for choosing isolated git worktrees when implementation should not happen in the current tree.
  - Requires baseline verification before implementation and emphasizes not disturbing the user's main working tree unnecessarily.

## Workflow Changes

### 2026-04-25

- `.trellis/workflow.md`
  - Added TDD and worktree isolation to the core principles.
  - Expanded the spec-system description so shared guides explicitly include TDD and worktree isolation.
  - Updated Phase 1 context curation guidance so implement/check context can include the new shared guides when relevant.
  - Updated Phase 2 implementation expectations so agents default to failing-test-first behavior work and use isolated worktrees when the current tree should stay untouched.
  - Added concise model-selection guidance so lighter tiers are preferred for low-stakes operational loops and stronger tiers for demanding reasoning work.
  - Added broad tier examples that fit this environment, such as Haiku-class for monitoring/debug loops and Sonnet/Opus-class for demanding requirement, implementation, review, and design work.

## Why These Customizations Exist

- TDD keeps behavior changes anchored to executable proof instead of memory.
- Worktree guidance reduces accidental disruption when parallel work or isolation matters.
- Model-tier guidance helps control cost and latency without underpowering demanding work.
- Recording these rules in shared Trellis docs makes them visible to future implement/check flows instead of relying on one-off reminders.
