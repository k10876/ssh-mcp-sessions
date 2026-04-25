# Tests and docs for ssh-cli-sessions

## Goal

Finish the product shift by validating behavior with tests and documenting CLI-first usage with optional MCP mode.

## Requirements

- Update `package.json` name, description, keywords, and binary to `ssh-cli-sessions` / `ssh-cli`.
- Update README and relevant docs to describe the Linux CLI-first SSH session manager.
- Document core commands with examples for add-host, start, exec, list/ps, kill/close, logs, attach, and mcp mode.
- Document storage paths: `~/.ssh-cli-sessions/hosts.json` and `~/.ssh-cli-sessions/logs/`.
- Document limitations/non-goals: no auto-reconnect, no port forwarding, no cross-reboot persistence, no GUI/TUI.
- Add/update tests for CLI parsing, host storage, command sanitization, session service behavior, logging, and MCP adapter behavior where feasible.
- Ensure build/test commands work.

## Acceptance Criteria

- [ ] Package metadata reflects the new project identity.
- [ ] README explains CLI-first usage and optional MCP mode.
- [ ] Tests cover the main behavior introduced by the refactor.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] Docs do not present MCP as the primary interface.

## Dependencies

- Should be done after or alongside implementation subtasks so docs match actual behavior.
- Parent PRD: `../04-25-agent-implementation-task/prd.md`

## Out of Scope

- Marketing site or generated API docs.
- New features beyond documenting/testing this CLI-first conversion.
