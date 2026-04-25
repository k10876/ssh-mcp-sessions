# Error Handling

> How errors are handled in this project.

---

## Overview

Backend services should throw protocol-neutral application errors. Interface layers map those errors to CLI or MCP behavior.

---

## Error Types

- **AppError**: Shared base error for backend/service-layer failures.
- **ValidationError**: Invalid user or caller input at a boundary.
- **HostStoreError**: Host persistence and private-key loading failures.
- **HostNotFoundError**: Requested stored host does not exist.
- **SessionError**: Generic session lifecycle failure.
- **SessionNotFoundError**: Requested session does not exist.
- **SessionExistsError**: Attempted to create a duplicate named session.
- **SessionBusyError**: Attempted to run a command while one is already pending.
- **McpError**: Used only at the MCP adapter boundary.
- **CLIError**: CLI-specific issues with user-friendly messages.

---

## Error Handling Patterns

- **Core Services**: Throw app errors from `src/errors.ts`; do not throw `McpError` directly from services or utilities.
- **MCP Mode**: Map backend errors to `McpError` in `src/index.ts`.
- **CLI Mode**: Catch top-level errors in the CLI entry point and print user-friendly messages to `stderr` before exiting with a non-zero code.
- **Contextual Messages**: Wrap low-level fs/SSH failures with host or session identifiers so callers know which resource failed.
- **Cleanup**: Always ensure SSH connections are closed even when command execution or connection setup fails.

---

## Scenario: Backend-to-MCP error boundary

### 1. Scope / Trigger
- Trigger: this task split reusable backend services away from the MCP-specific entrypoint, so error mapping is now an explicit interface contract.

### 2. Signatures
- `class AppError extends Error`
- `class ValidationError extends AppError`
- `class HostStoreError extends AppError`
- `class HostNotFoundError extends AppError`
- `class SessionError extends AppError`
- `class SessionNotFoundError extends SessionError`
- `class SessionExistsError extends SessionError`
- `class SessionBusyError extends SessionError`
- `toMcpError(error: unknown): McpError`

### 3. Contracts
- Service and utility modules may throw only protocol-neutral app errors (or underlying unexpected `Error` values that adapters normalize).
- MCP adapter mapping:
  - `ValidationError` -> `ErrorCode.InvalidParams`
  - `HostNotFoundError` / `SessionNotFoundError` -> `ErrorCode.InvalidParams`
  - `SessionExistsError` / `SessionBusyError` -> `ErrorCode.InvalidRequest`
  - `HostStoreError` / `SessionError` -> `ErrorCode.InternalError`
- Wrapped fs errors must preserve resource context such as host id or file purpose.

### 4. Validation & Error Matrix
- invalid command input -> `ValidationError`
- missing host id in storage -> `HostNotFoundError`
- malformed `hosts.json` or unreadable private key -> `HostStoreError`
- duplicate named session -> `SessionExistsError`
- missing session -> `SessionNotFoundError`
- overlapping command execution -> `SessionBusyError`
- MCP boundary receives any app error -> mapped `McpError`

### 5. Good/Base/Bad Cases
- Good: `HostStoreError("Failed to read private key for host 'dev': ENOENT ...")`
- Base: unexpected unknown error falls through to generic internal MCP error mapping
- Bad: throwing `new McpError(...)` from `src/services/host-store.ts`

### 6. Tests Required
- Unit: backend helpers throw app errors, not MCP SDK errors
- Unit: MCP adapter maps each backend error family to the expected MCP error code
- Unit: wrapped host-store failures include host-specific context
- Assertion points:
  - service-layer imports must not depend on MCP types
  - adapter mapping remains centralized in the entrypoint / MCP module

### 7. Wrong vs Correct
#### Wrong
```typescript
throw new McpError(ErrorCode.InvalidParams, `Host '${hostId}' not found`);
```

#### Correct
```typescript
throw new HostNotFoundError(`Host '${hostId}' not found`);
```

---

## Common Mistakes

- **Swallowing Errors**: Avoid empty `catch` blocks.
- **Generic Error Messages**: "Something went wrong" is unhelpful. Always include context such as host id or session id.
- **Protocol Leakage**: Do not let MCP-specific error types leak into shared backend modules.
- **Exposing Secrets**: Ensure error messages don't leak passwords or private keys.
