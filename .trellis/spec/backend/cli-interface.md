# CLI Interface Guidelines

> Patterns and conventions for the `ssh-cli` command-line interface.

## Overview

The primary interface for `ssh-cli-sessions` is a human-friendly CLI. It also supports an MCP server mode for AI integration.

## Core Commands

| Command | Description |
|---------|-------------|
| `add-host` | Add a new SSH host configuration to `~/.ssh-mcp/hosts.json`. |
| `start` | Start a new named session for a host. |
| `exec` | Execute a non-interactive command in a session. |
| `list` | List active sessions and configured hosts. |
| `kill` | Terminate an active session. |
| `logs` | View session logs from `~/.ssh-cli-sessions/logs/`. |
| `attach` | Enter an interactive session using `tmux` on the remote host. |

## Interaction Patterns

### Human-Friendly Output
- Use clear, concise status messages.
- Format tables for `list` commands.
- Provide progress indicators for long-running operations (e.g., establishing connection).

### AI Auto Mode
- Implement an optional pre-execution review for commands when running in "auto" mode.
- Example: `ssh-cli exec --auto "rm -rf /"` should prompt for confirmation showing the impact.

### Interactive Access
- The `attach` command must use `tmux` on the remote host to ensure session persistence even if the local connection drops.
- Example: `ssh-cli attach <session-id>` -> `ssh -t <host> "tmux attach -t <session-id> || tmux new -s <session-id>"`

## Naming Conventions
- Commands: `kebab-case` (e.g., `add-host`).
- Flags: Double dash `kebab-case` (e.g., `--session-id`).
- Positional arguments: Descriptive (e.g., `HOST_ID`).
