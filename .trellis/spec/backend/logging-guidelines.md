# Logging Guidelines

> How logging is done in this project.

---

## Overview

<!--
Document your project's logging conventions here.

Questions to answer:
- What logging library do you use?
- What are the log levels and when to use each?
- What should be logged?
- What should NOT be logged (PII, secrets)?
-->

(To be filled by the team)

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

---

## What NOT to Log

- **Passwords**: Never log plain-text passwords. Redact them if they appear in configs during debug.
- **Private Keys**: Never log private key contents. Log only the `keyPath`.
- **Sensitive Output**: While session logs capture output for the user, avoid logging sensitive results to system-wide logs.

---

## Examples

### Logging a command execution
```typescript
// Into session log
await appendFile(sessionLogPath, `[${new Date().toISOString()}] EXEC: ${command}\n`);
```
