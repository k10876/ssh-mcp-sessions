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
| `attach` | Enter an interactive session using local `tmux` around a direct SSH connection. |
| `put` | Upload a file or directory to a stored host over direct SFTP. |
| `get` | Download a file or directory from a stored host over direct SFTP. |

## Interaction Patterns

### Human-Friendly Output
- Use clear, concise status messages.
- Format tables for `list` commands.
- Provide progress indicators for long-running operations (e.g., establishing connection).

### AI Auto Mode
- Implement an optional pre-execution review for commands when running in "auto" mode.
- Example: `ssh-cli exec --auto "rm -rf /"` should prompt for confirmation showing the impact.

### Interactive Access
- The `attach` command must use `tmux` on the local machine only and open a direct interactive SSH connection to the remote shell.
- When a stored host matches the session connection details, `attach` must reuse the stored auth mode for the spawned local `ssh` process (key path, password via explicit local helper, or agent fallback).
- Password-backed attach must fail with a clear prerequisite/help message if the required local helper is missing; do not silently fall through to an unexpected password prompt.
- Example: `ssh-cli attach <session-id>` -> `tmux new-session -A -s ssh-cli-<session-id> ssh -t <host>`

### Direct Transfers
- `put` and `get` must connect directly to the stored host with SFTP; they are not session-bound operations.
- Both commands require `--host <host>` plus source and destination positional paths.
- Directory transfers must fail clearly unless `--recursive` is provided.
- Success output should be concise and confirm the transfer direction and endpoints.

## Naming Conventions
- Commands: `kebab-case` (e.g., `add-host`).
- Flags: Double dash `kebab-case` (e.g., `--session-id`).
- Positional arguments: Descriptive (e.g., `HOST_ID`).
