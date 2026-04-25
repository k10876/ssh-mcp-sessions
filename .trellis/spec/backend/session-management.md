# Session Management Guidelines

> Rules for persistent session handling and lifecycle.

## Overview

Sessions in `ssh-cli-sessions` are designed to be persistent and accessible across multiple CLI invocations or MCP tool calls.

## Persistence Rules

- **Storage**: Sessions are held in-memory by the background daemon/server.
- **Naming**: Every session MUST have a name (defaulting to a generated UUID if not provided).
- **Logs**: Every session MUST log its activity (stdout/stderr) to `~/.ssh-cli-sessions/logs/<session-id>.log`.

## Lifecycle

- **Inactivity Timeout**: Sessions automatically terminate after **24 hours** of inactivity.
- **Heartbeats**: The server should periodically check connectivity to remote hosts.
- **Cleanup**: On explicit `kill` or timeout, the server must close the SSH connection and clean up local resources.

## Examples

### Session Startup (Conceptual)
```typescript
const session = new PersistentSession({
  id: "my-dev-session",
  hostConfig: config,
  timeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  logPath: `~/.ssh-cli-sessions/logs/my-dev-session.log`
});
```

### Log Rotation
Logs should be managed to prevent disk exhaustion, though for this tool, simple per-session files are usually sufficient until the session is killed.
