# CLI command surface for ssh-cli

## Goal

Make `ssh-cli` the primary human-facing interface for managing SSH hosts and named sessions.

## Requirements

- Expose executable `ssh-cli` through package metadata and the Node entrypoint.
- Implement CLI dispatch for:
  - `ssh-cli add-host <name> --host user@host [--port 22] [--key-path <path>] [--password <password>]`
  - `ssh-cli start <session-name> --host <host>`
  - `ssh-cli exec <session-name> "<command>"`
  - `ssh-cli list` and/or `ssh-cli ps`
  - `ssh-cli kill <session-name>` and/or `ssh-cli close <session-name>`
  - `ssh-cli logs <session-name>` with basic view/tail support if feasible
  - `ssh-cli attach <session-name>` with tmux-based direct attach or clear fallback instructions
  - `ssh-cli mcp` for optional MCP mode
- Print clear human-readable output and non-zero exit codes on errors.
- Keep command validation at CLI boundaries and call shared services for business logic.
- Add AI auto mode flag/env handling as opt-in only; default execution must not call external AI.

## Acceptance Criteria

- [ ] `ssh-cli --help` or equivalent usage output lists core commands.
- [ ] Host/session commands call the shared backend rather than duplicating session logic.
- [ ] CLI errors are user-friendly and do not expose secrets.
- [ ] `attach` either performs tmux attach/new over SSH or prints exact instructions.
- [ ] Tests cover CLI argument parsing/dispatch for the major commands.
- [ ] `npm run build` and `npm test` pass.

## Dependencies

- Depends on core backend extraction or compatible shared service interfaces.
- Parent PRD: `../04-25-agent-implementation-task/prd.md`

## Out of Scope

- Complex TUI/GUI.
- Auto-reconnect or port forwarding.
