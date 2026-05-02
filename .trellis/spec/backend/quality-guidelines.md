# Quality Guidelines

> Code quality standards for backend development.

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
- **Normalize Callback APIs at Boundaries**: When a dependency exposes callback-style APIs such as `ssh2` SFTP clients, wrap them into the project's promise-based interface at the boundary instead of `await`-ing raw third-party objects throughout business logic.

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
- If a third-party callback API is being consumed, is it adapted once at the boundary and covered by a regression test against the real callback shape?

---

## Common Mistakes

### Common Mistake: Awaiting raw `ssh2` SFTP methods as if they were promises

**Symptom**: Runtime errors like `Cannot read properties of undefined` or `callback is not a function` during file transfer.

**Cause**: `ssh2` SFTP methods such as `stat`, `readdir`, `mkdir`, `fastPut`, and `fastGet` are callback-based. Directly treating the raw SFTP object as a promise-returning interface breaks at runtime even if tests with promise-shaped mocks pass.

**Fix**: Wrap the raw SFTP client once at the integration boundary and expose a promise-based internal interface.

**Prevention**: Keep at least one regression test that exercises the callback-shaped API instead of only promise-shaped mocks.
