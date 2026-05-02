# ssh-cli-sessions

A Linux-first CLI SSH session manager with named persistent shells, per-session logs, dead-session visibility, and optional MCP mode for LLM tooling.

## Overview

`ssh-cli-sessions` makes `ssh-cli` the primary interface for working with long-lived SSH shells from a terminal. It keeps named sessions in memory so repeated `exec` calls can preserve remote shell state such as the current working directory and environment variables. MCP support remains available through an explicit `ssh-cli mcp` command, but it is secondary to the human CLI workflow.

## Features

- CLI-first workflow for humans on Linux
- Named SSH sessions with shell reuse across CLI commands
- Host storage in `~/.ssh-cli-sessions/hosts.json`
- Session logs in `~/.ssh-cli-sessions/logs/`
- Password, private key, and SSH agent authentication
- Session death tracking for `error`, `close`, and `end` events
- `list` / `ps` output that shows active and recently dead sessions
- `attach` guidance for remote `tmux` sessions
- Optional MCP mode via `ssh-cli mcp`
- Opt-in AI auto mode hook via `SSH_CLI_AI_AUTO_MODE=true` or `--auto`

## Installation

### Global install

```bash
npm install -g ssh-cli-sessions
```

This installs the `ssh-cli` executable.

### Local install

```bash
npm install ssh-cli-sessions
npx ssh-cli --help
```

## Quick start

Add a host:

```bash
ssh-cli add-host dev --host alice@example.com --key-path ~/.ssh/id_ed25519
```

Start a named session:

```bash
ssh-cli start work --host dev
```

Run commands against the same remote shell:

```bash
ssh-cli exec work "pwd"
ssh-cli exec work "export APP_ENV=dev"
ssh-cli exec work "echo $APP_ENV"
```

Inspect hosts and sessions:

```bash
ssh-cli list
ssh-cli ps
```

Close the session:

```bash
ssh-cli kill work
# or
ssh-cli close work
```

## Commands

### `ssh-cli add-host <name> --host user@host [--port 22] [--key-path <path>] [--password <password>]`

Stores an SSH host definition for later use.

Examples:

```bash
ssh-cli add-host dev --host alice@example.com --key-path ~/.ssh/id_ed25519
ssh-cli add-host staging --host deploy@staging.example.com --port 2222 --password "$STAGING_PASSWORD"
```

Notes:

- `--host` must be in `user@host` form.
- Use either `--key-path` or `--password`, not both.
- If neither is provided, the host can fall back to SSH agent auth when `SSH_AUTH_SOCK` is available.

### `ssh-cli start <session-name> --host <host>`

Starts a named session for a configured host.

```bash
ssh-cli start deploy-shell --host staging
```

Sessions are held by a lightweight local `ssh-cli` daemon so later CLI commands can reuse the same shell state.

### `ssh-cli exec <session-name> "<command>"`

Runs a command inside an existing named session.

```bash
ssh-cli exec deploy-shell "pwd"
ssh-cli exec deploy-shell "npm test"
```

The command reuses the existing SSH shell, so remote state can carry across executions.

#### AI auto mode

AI review hooks are opt-in only.

```bash
ssh-cli exec deploy-shell --auto "rm -rf /tmp/build"
```

Or enable globally:

```bash
export SSH_CLI_AI_AUTO_MODE=true
```

If no review provider is configured, the CLI prints a clear message and continues without blocking normal execution.

### `ssh-cli list` / `ssh-cli ps`

Shows configured hosts plus active and recently dead sessions.

Recently dead sessions include status, death reason, and log path.

```bash
ssh-cli list
ssh-cli ps
```

### `ssh-cli kill <session-name>` / `ssh-cli close <session-name>`

Closes a named session.

```bash
ssh-cli kill deploy-shell
ssh-cli close deploy-shell
```

### `ssh-cli logs <session-name>`

Shows a session log file.

Examples:

```bash
ssh-cli logs deploy-shell
ssh-cli logs deploy-shell --lines 50
ssh-cli logs deploy-shell --follow
```

Current follow mode prints the current contents plus a note that streaming follow is not yet implemented.

### `ssh-cli attach <session-name>`

Prints practical `ssh` + `tmux` attach instructions for humans.

Example output pattern:

```bash
ssh -t alice@example.com "tmux attach -t ssh-cli-deploy-shell || tmux new -s ssh-cli-deploy-shell"
```

This is intended as a practical path for jumping into the remote environment interactively.

### `ssh-cli mcp`

Starts the optional MCP server mode.

```bash
ssh-cli mcp
```

Use this when an MCP-capable client needs to reuse the same backend concepts. MCP is not the default product framing.

## Storage paths

### Hosts

Hosts are stored at:

```text
~/.ssh-cli-sessions/hosts.json
```

The file is stored as wrapped JSON:

```json
{
  "hosts": [
    {
      "id": "dev",
      "host": "example.com",
      "port": 22,
      "username": "alice",
      "keyPath": "~/.ssh/id_ed25519"
    }
  ]
}
```

The implementation uses restricted permissions where feasible:

- config directory: `0700`
- hosts file: `0600`

### Logs

Session logs are stored at:

```text
~/.ssh-cli-sessions/logs/
```

Each session writes to:

```text
~/.ssh-cli-sessions/logs/<session-name>.log
```

Logs include timestamped entries for:

- session start
- command execution
- result summaries
- requested close
- inactivity timeout
- unexpected disconnect/death reason

## Session observability

When an SSH session dies unexpectedly, the service keeps a recently dead record instead of silently removing it.

This means:

- `list` and `ps` can show dead sessions
- dead sessions include the reason and log path
- a future `exec` against a dead session reports a clear error with the log path
- hook-style notices can surface on later list/exec calls

## Environment variables

### `SSH_CLI_MAX_INACTIVITY_MS`

Controls the inactivity timeout for sessions.

- default: 24 hours
- accepted only when set to a positive integer string
- invalid values fall back to the default

Example:

```bash
export SSH_CLI_MAX_INACTIVITY_MS=86400000
```

### `SSH_CLI_AI_AUTO_MODE`

Opt-in AI auto review hook.

```bash
export SSH_CLI_AI_AUTO_MODE=true
```

Default is off.

## Optional MCP mode

MCP remains supported for tooling compatibility, but it is explicit and secondary.

Example client command:

```json
{
  "mcpServers": {
    "ssh-cli": {
      "command": "ssh-cli",
      "args": ["mcp"]
    }
  }
}
```

## Development

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

## Limitations

This project intentionally does not implement:

- auto-reconnect
- port forwarding or tunnels
- cross-reboot persistence
- heavy remote orchestration behavior by default
- GUI or TUI interfaces

Additional notes:

- sessions live in a lightweight local `ssh-cli` daemon
- if that daemon stops, active sessions are lost
- direct interactive attach is currently instruction-based rather than a fully managed local wrapper
- logs are for session observability, but secrets should not be written to system-level logs

## License

MIT
