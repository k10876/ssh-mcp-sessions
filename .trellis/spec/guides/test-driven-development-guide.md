# Test-Driven Development Guide

> **Purpose**: Keep implementation in a red-green-refactor loop so behavior changes are proven before they spread.

---

## Default Loop

1. **Red** — write or update the smallest test that captures the behavior change
2. **Verify red** — run it and confirm it fails for the expected reason
3. **Green** — write the minimum production code needed to pass
4. **Refactor** — clean up while keeping the test suite green

If you did not see the test fail first, you do not yet know that it protects the behavior you are changing.

---

## When This Guide Applies

Use TDD by default when automated tests are feasible, especially for:

- bug fixes
- new user-visible behavior
- changes to contracts, validation, or edge-case handling
- refactors that need behavior safety

---

## Practical Rules

- Start with a failing test for behavior changes whenever the project has a reasonable place to add one.
- Keep the first test narrow: one behavior, one failure, one reason to pass.
- Write the smallest code change that makes the new test pass.
- After green, refactor only as far as the tests keep proving the behavior.
- For bug fixes, keep the regression test with the fix.

---

## When Not to Self-Exempt

Do not quietly skip TDD just because:

- the change feels small
- you already explored the code mentally
- adding the test is inconvenient
- you plan to "cover it later"

If you think tests are not feasible or the task needs an exception, ask the human before exempting the work. Briefly explain why testing is impractical and what verification you will use instead.

Typical examples that may justify asking: pure documentation changes, wiring with no executable surface, or repo limitations that make automated coverage genuinely unavailable.

---

## Quick Checklist

- [ ] I can state the intended behavior before changing code
- [ ] I started with a failing test when tests were feasible
- [ ] The new code is the minimum needed for green
- [ ] I kept or added regression coverage for bug fixes
- [ ] I asked the human before taking a no-test exception
