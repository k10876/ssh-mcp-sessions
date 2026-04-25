# Thinking Guides

> **Purpose**: Expand your thinking to catch things you might not have considered.

---

## Why Thinking Guides?

**Most bugs and tech debt come from "didn't think of that"**, not from lack of skill:

- Didn't think about what happens at layer boundaries → cross-layer bugs
- Didn't think about code patterns repeating → duplicated code everywhere
- Didn't think about edge cases → runtime errors
- Didn't think about future maintainers → unreadable code
- Didn't think about implementation discipline → regressions and rework
- Didn't think about workspace isolation → accidental disruption in the wrong tree

These guides help you **ask the right questions before coding**.

---

## Available Guides

| Guide | Purpose | When to Use |
|-------|---------|-------------|
| [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md) | Identify patterns and reduce duplication | When you notice repeated patterns |
| [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md) | Think through data flow across layers | Features spanning multiple layers |
| [Test-Driven Development Guide](./test-driven-development-guide.md) | Keep implementation in a red-green-refactor loop | Behavior changes and bug fixes where tests are feasible |
| [Worktree Usage Guide](./worktree-usage-guide.md) | Choose when to isolate work in a separate git worktree | Parallel work, risky implementation, or when the current tree should stay undisturbed |

---

## Quick Reference: Thinking Triggers

### When to Think About Cross-Layer Issues

- [ ] Feature touches 3+ layers (API, Service, Component, Database)
- [ ] Data format changes between layers
- [ ] Multiple consumers need the same data
- [ ] You're not sure where to put some logic

→ Read [Cross-Layer Thinking Guide](./cross-layer-thinking-guide.md)

### When to Think About Code Reuse

- [ ] You're writing similar code to something that exists
- [ ] You see the same pattern repeated 3+ times
- [ ] You're adding a new field to multiple places
- [ ] **You're modifying any constant or config**
- [ ] **You're creating a new utility/helper function** ← Search first!

→ Read [Code Reuse Thinking Guide](./code-reuse-thinking-guide.md)

### When to Think About TDD

- [ ] You're changing behavior that can be covered by an automated test
- [ ] You're fixing a bug that should stay fixed
- [ ] You can describe the expected result before writing code
- [ ] You're tempted to code first and "add tests after"

→ Read [Test-Driven Development Guide](./test-driven-development-guide.md)

### When to Think About Worktree Isolation

- [ ] You should not implement in the current working tree
- [ ] You need clean separation for parallel work
- [ ] The task may disturb ongoing user changes if done here
- [ ] You need a clean baseline before starting implementation

→ Read [Worktree Usage Guide](./worktree-usage-guide.md)

---

## Pre-Modification Rule (CRITICAL)

> **Before changing ANY value, ALWAYS search first!**

```bash
# Search for the value you're about to change
rg "value_to_change"
```

This single habit prevents most "forgot to update X" bugs.

---

## How to Use This Directory

1. **Before coding**: Skim the relevant thinking guide
2. **During coding**: If something feels repetitive, risky, or under-specified, check the guides
3. **After bugs**: Add new insights to the relevant guide (learn from mistakes)

---

## Contributing

Found a new "didn't think of that" moment? Add it to the relevant guide.

---

**Core Principle**: 30 minutes of thinking saves 3 hours of debugging.
