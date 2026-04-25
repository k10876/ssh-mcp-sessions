# Worktree Usage Guide

> **Purpose**: Use git worktrees for isolation when implementation should happen away from the current tree or when parallel work needs clean separation.

---

## When Isolation Is Appropriate

Prefer a separate worktree when any of these are true:

- implementation should not happen in the user's current working tree
- the user already has in-progress changes you should avoid disturbing
- parallel tasks need clean separation by branch or workspace
- the task is risky enough that a clean baseline matters before you start

If the current tree is already the intended isolated workspace, do not create extra worktrees just for ceremony.

---

## Worktree Selection Rules

1. **Prefer existing project conventions** for worktree location and naming if the repo already documents or demonstrates them.
2. **Keep the user's main working tree stable** unless they explicitly want the work done there.
3. **Choose isolation only when it helps**; avoid unnecessary workspace churn.

---

## Before Implementing in a Worktree

Verify the baseline first:

- confirm you are in the correct repository and target branch context
- ensure the worktree starts from a clean status for the task branch
- run the project's baseline verification commands before implementation when feasible
- if the baseline already fails, report that before layering new work on top

The point is to distinguish pre-existing failures from regressions introduced by the task.

---

## Practical Reminders

- Prefer the repo's established worktree directory conventions when present.
- Keep setup and verification lightweight; only do what is needed to establish a trustworthy starting point.
- Do not move, rewrite, or otherwise disturb the user's main tree unnecessarily.
- When parallel work is involved, keep each worktree scoped to one task or branch.

---

## Quick Checklist

- [ ] Isolation is justified for this task
- [ ] I followed existing repo worktree conventions when present
- [ ] I verified a clean baseline before implementing
- [ ] I avoided disturbing the user's main working tree unnecessarily
