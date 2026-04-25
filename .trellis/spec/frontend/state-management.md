# State Management (CLI Context)

> How the CLI tracks local state.

---

## Overview

The CLI state is primarily transient, but some state is persisted or managed during a single execution.

---

## State Categories

- **Process State**: Managed by the CLI runner (e.g., current active command).
- **Session State**: Managed by the background daemon/server, queried by the CLI via MCP or local IPC.
- **Config State**: Read from `~/.ssh-mcp/hosts.json` and cached during execution.

---

## When to Use Persistent State

- Use `~/.ssh-mcp/hosts.json` for long-term storage of host configurations.
- Use `~/.ssh-cli-sessions/logs/` for session-specific history.

---

## Common Mistakes

- **Stale Data**: Always refresh session lists before displaying them to the user.
- **Race Conditions**: Be careful when multiple CLI instances modify the same config file.
