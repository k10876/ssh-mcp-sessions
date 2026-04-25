# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

- **No Synchronous I/O**: Avoid `fs.readFileSync`. Use `fs/promises`.
- **No Manual String Escaping for Commands**: Use robust sanitization or parameterization where possible.
- **No Unnamed Sessions**: All sessions must be identifiable (UUID or user-provided name).
- **No Global State in Services**: Services should be instantiable and testable; avoid relying on global `activeSessions` maps directly within core logic.

---

## Required Patterns

- **Zod for Validation**: Always use `zod` to validate host configurations, CLI arguments, and MCP tool inputs.
- **Graceful SSH Cleanup**: Always ensure SSH connections are closed on process exit or session timeout. Use `AbortController` or similar for cancellation.
- **Explicit Typing**: Leverage TypeScript's type system; avoid `any`. Use `Strict` mode in `tsconfig.json`.
- **Interface Segregation**: Keep CLI logic separate from MCP logic; both should use a shared service layer.

---

## Testing Requirements

- **Unit Tests**: Mandatory for logic like command sanitization, path expansion, and configuration parsing.
- **Integration Tests**: Preferred for verifying SSH connectivity and session persistence (using `ssh2-server` or `testcontainers`).
- **Mocking**: Mock the SSH connection for unit tests to verify session management logic.

---

## Code Review Checklist

- Does the change maintain CLI/MCP parity?
- Is there proper error handling for network failures?
- Are secrets handled securely (not logged, not stored in plain text if avoidable)?
- Is the 24h inactivity timeout correctly implemented?
- Are session logs being written to the correct directory?
