# Logging Guidelines

> How logging is done in this project.

---

## Overview

**Logging conventions:**
- Most command and session logs are written directly to per-session log files under `~/.ssh-cli-sessions/logs/` using explicit file append operations.
- Critical errors and lifecycle events may additionally be written to `stderr` (or the main application log, if configured).

**Log levels and usage:**
- **Error**: Critical failures—connection errors, command execution errors, unrecoverable filesystem issues.
- **Warn**: Recoverable problems—session timeouts, unexpected disconnects, slow connections.
- **Info**: Routine events—session creation/termination, command execution (log command name, not full details), successful host registration.
- **Debug**: Internal details—raw SSH traffic logs (if enabled), state transitions, detailed processing steps.

**What gets logged:**
- Every executed command (with timestamps) is appended to the session log file.
- Session lifecycle events (start, stop, timeout, death) are logged to the session log, and optionally to `stderr` for system observability.
- Host registration and host metadata changes are audit-logged.
- File get, pull, locations from and to are recorded.
- Direct transfer commands (`put` / `get`) should be audit-logged separately from session logs because they are host operations, not shell-session operations.

**What is never logged:**
- Plain-text passwords and private key contents are never included in any logs.
- Only file paths for keys (e.g., `keyPath`) may appear.
- Sensitive command output is restricted to session logs only—never written to system-level/global logs.

Security is prioritized: explicit redaction is performed if passwords, secrets, or private key data could otherwise leak into logs (especially in debug mode).

---

## Log Levels

- **Error**: Connection failures, command execution errors, file system errors.
- **Warn**: Session timeouts, unexpected disconnections, slow connections.
- **Info**: Session creation, session termination, command execution (command name only), successful host registration.
- **Debug**: Detailed SSH protocol logs (if enabled), raw buffer processing, internal state transitions.

---

## What to Log

- **Session Logs**: Every command executed via `exec` (log to `~/.ssh-cli-sessions/logs/<session-id>.log`). Include timestamps and command output.
- **System Logs**: Session lifecycle events (start, stop, timeout) should go to the main application log (if configured) or `stderr` in debug mode.
- **Audit**: Log host registration changes (add/edit/remove).
- **Transfer Audit**: Log `put` / `get` operation type, stored host id, and source/destination paths to a transfer log under `~/.ssh-cli-sessions/logs/`.

---

## What NOT to Log

- **Passwords**: Never log plain-text passwords. Redact them if they appear in configs during debug.
- **Private Keys**: Never log private key contents. Log only the `keyPath`.
- **SSH Auth Material**: Never log `ConnectConfig.password`, `privateKey`, or any derived secret-bearing payloads when recording transfer activity.
- **Sensitive Output**: While session logs capture output for the user, avoid logging sensitive results to system-wide logs.

---

## Examples

### Logging a command execution
```typescript
// Into session log
await appendFile(sessionLogPath, `[${new Date().toISOString()}] EXEC: ${command}\n`);
```
