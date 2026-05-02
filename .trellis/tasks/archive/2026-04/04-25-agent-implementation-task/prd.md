# Convert ssh-mcp-sessions into ssh-cli-sessions

## Goal

Rename and evolve the project from `ssh-mcp-sessions`, a primarily MCP stdio server, into `ssh-cli-sessions`, a practical Linux command-line SSH session manager for humans with optional MCP support for LLM agents. The CLI becomes the primary interface; MCP becomes a secondary mode that reuses the same host/session backend.

## What I Already Know

- Current package name is `ssh-mcp-sessions`, with a single `src/index.ts` containing host storage, MCP tool registration, SSH session management, and process entrypoint logic.
- Current binary is `ssh-mcp-sessions`; target CLI should expose `ssh-cli` commands.
- Existing implementation already uses `ssh2`, Zod, `@modelcontextprotocol/sdk`, TypeScript, and Vitest.
- Existing sessions reuse an SSH shell across `exec` calls, but timeout defaults are currently 2 hours and storage paths still use `~/.ssh-mcp` in places.
- Project specs already expect separation into `src/services/`, `src/cli/`, `src/mcp/`, `src/types/`, and `src/utils/`.
- Primary target platform is Linux.

## Requirements

### Product Identity

- Rename project/package identity to `ssh-cli-sessions`.
- Update package binary from the old MCP-first executable to a CLI-first executable named `ssh-cli`.
- Update descriptions/docs to describe a lightweight CLI SSH session manager with optional MCP mode.
- Keep MCP functionality available as an optional mode, not the default product framing.

### CLI-First Interface

Implement the following human-facing CLI commands:

- `ssh-cli add-host <name> --host user@host [--port 22] [--key-path <path>] [--password <password>]`
- `ssh-cli start <session-name> --host <host>`
- `ssh-cli exec <session-name> "<command>"`
- `ssh-cli list` and/or `ssh-cli ps`
- `ssh-cli kill <session-name>` and/or `ssh-cli close <session-name>`
- `ssh-cli logs <session-name>` with a way to view/tail logs
- `ssh-cli attach <session-name>` for interactive human access
- `ssh-cli mcp` or equivalent explicit MCP server mode

CLI output should be clear for humans: concise status messages, useful tables for list/ps, non-zero exit codes on errors, and human-readable stderr messages before stack traces.

### Shared Backend

- Extract host configuration, session lifecycle, command execution, logging, and MCP wrappers into separate modules rather than keeping all logic in `src/index.ts`.
- CLI and MCP modes must share the same service layer.
- Avoid interface-specific business logic duplication.
- Keep sessions in-memory; no heavy daemon or autossh by default.
- Do not implement auto-reconnect.

### Host Storage & Config

- Store hosts in `~/.ssh-cli-sessions/hosts.json`.
- Store logs in `~/.ssh-cli-sessions/logs/`.
- Validate host/config data with Zod.
- Use restricted permissions where feasible: config file `0600`, config/log directories `0700`.
- Prefer atomic writes for `hosts.json` updates.
- Support keys, password, and SSH agent authentication.
- Support `SSH_CLI_MAX_INACTIVITY_MS` with default 24 hours.
- Support `SSH_CLI_AI_AUTO_MODE=true` as opt-in only.

### Session Behavior

- Use `ssh2` shell reuse so repeated `exec` calls preserve remote shell state such as cwd, env vars, and running shell context where possible.
- Named sessions are required; no unnamed core session state.
- Sessions are in-memory and disappear on process restart; this is acceptable and should be documented.
- `start` should create a named session for a configured host or clearly report if it already exists.
- `exec` should reuse an existing named session and return command output plus correct exit behavior.
- Inactivity timeout defaults to 24 hours and is configurable via env var.

### Logging, Death Detection, and Hooks

- Write per-session logs to `~/.ssh-cli-sessions/logs/<session-name>.log`.
- Log session start, every `exec` command, result summary, close/kill, timeout, and unexpected death/disconnect reason.
- Detect unexpected SSH `error`, `close`, and `end` events.
- Mark sessions dead rather than silently deleting all evidence.
- `list` / `ps` should show active sessions and recently dead sessions with status, death reason, and log path.
- On next `exec` or `list`, surface a clear hook/notification-style message for dead sessions including the log path.

### Interactive Human Access

- `ssh-cli attach <session-name>` should provide a practical Linux path for entering the remote environment interactively.
- Preferred pattern: create/use a named remote `tmux` session such as `ssh-cli-<session-name>`.
- Direct attach may run an SSH command equivalent to `ssh -t <host> "tmux attach -t ssh-cli-<session-name> || tmux new -s ssh-cli-<session-name>"`.
- If direct attach is not fully implemented in the first pass, it must print clear SSH/tmux instructions for the user.
- Goal: agent/CLI can run long tasks in tmux and a human can jump in with one command.

### AI Auto Mode

- AI auto mode is opt-in via `SSH_CLI_AI_AUTO_MODE=true` and/or an explicit CLI flag.
- Default is off.
- When enabled, before executing a command the CLI may query an external AI review provider or produce a clearly marked hook point for future integration.
- If no provider is configured, do not block normal execution unless the user explicitly requested AI review.
- Never introduce hidden latency/cost in default execution.

### Optional MCP Mode

- Preserve current MCP capabilities through an explicit mode such as `ssh-cli mcp`.
- MCP tools should reuse the same host store and session service as the CLI.
- MCP mode should not own the core backend architecture.
- MCP tool names may remain compatible where reasonable, but docs should present MCP as secondary/optional.

## Acceptance Criteria

- [ ] `package.json` package metadata and executable reflect `ssh-cli-sessions` / `ssh-cli`.
- [ ] `npm run build` succeeds.
- [ ] Existing tests are updated or replaced so `npm test` succeeds.
- [ ] Source is split into service, CLI, MCP, utility, and type modules consistent with `.trellis/spec/backend/directory-structure.md`.
- [ ] CLI commands listed above exist and return useful human-readable output.
- [ ] Host configs are read/written under `~/.ssh-cli-sessions/hosts.json` with validation.
- [ ] Session logs are written under `~/.ssh-cli-sessions/logs/`.
- [ ] Inactivity timeout defaults to 24 hours and can be overridden with `SSH_CLI_MAX_INACTIVITY_MS`.
- [ ] Session death/disconnect is tracked and appears in list/ps output with reason and log path.
- [ ] `attach` either performs tmux-based interactive attach or prints exact attach instructions.
- [ ] MCP mode remains available and uses the shared backend.
- [ ] README/docs describe CLI-first usage and optional MCP mode.

## Definition of Done

- Tests added/updated for host storage, CLI parsing/dispatch, command sanitization, session lifecycle edge cases, and MCP wrapper behavior where practical.
- Build and test commands pass locally.
- User-facing docs updated.
- No secrets are logged.
- No auto-reconnect, port forwarding, GUI/TUI, or cross-reboot persistence are introduced.

## Technical Approach

Implement this as a staged refactor with behavior preserved while moving from MCP-first to CLI-first:

1. Extract shared backend modules from `src/index.ts`.
2. Add CLI parsing and command handlers around the shared backend.
3. Move MCP registration into explicit MCP mode using the same backend.
4. Add storage/logging/death-state behavior and 24-hour timeout defaults.
5. Add attach/tmux support or clear fallback instructions.
6. Update package metadata, README, tests, and specs as needed.

## Decision (ADR-lite)

**Context**: The current repo is an MCP stdio server with all logic in one TypeScript entrypoint, but the desired product is a human-first Linux CLI with optional MCP support.

**Decision**: Make `ssh-cli` the primary binary and use explicit MCP mode for LLM agents. Extract shared services so CLI and MCP reuse the same host/session backend.

**Consequences**: This is a broad refactor touching package metadata, source layout, tests, and docs. It avoids a daemon/autossh design for now, so in-memory sessions remain simple and restart-limited by design.

## Subtask Plan

1. **Core backend extraction** — split host store, config, utilities, session service, logging, and shared types out of `src/index.ts`.
2. **CLI command surface** — implement `ssh-cli` command parsing and handlers for host/session/log/attach commands.
3. **MCP compatibility mode** — move MCP server registration behind explicit `ssh-cli mcp` mode using shared services.
4. **Session observability and death handling** — implement 24-hour timeout config, per-session logs, dead-session tracking, and hook-style user messages.
5. **Tests and documentation** — update unit/integration tests plus README/package metadata/docs for CLI-first usage.

## Out of Scope

- Auto-reconnect after disconnect.
- Port forwarding or tunnels.
- Cross-reboot persistence.
- Heavy local daemon by default.
- Complex GUI or TUI.
- Storing long-lived session state on disk beyond host config, logs, and recently-dead metadata needed for current process reporting.

## Technical Notes

- Current entrypoint: `src/index.ts`.
- Current package metadata: `package.json` still uses `ssh-mcp-sessions` and binary `ssh-mcp-sessions`.
- Current host path in code: `~/.ssh-mcp/hosts.json`; target path: `~/.ssh-cli-sessions/hosts.json`.
- Current session timeout constants in code: 2 hours; target default: 24 hours via `SSH_CLI_MAX_INACTIVITY_MS`.
- Relevant Trellis specs:
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/backend/directory-structure.md`
  - `.trellis/spec/backend/cli-interface.md`
  - `.trellis/spec/backend/session-management.md`
  - `.trellis/spec/backend/database-guidelines.md`
  - `.trellis/spec/backend/logging-guidelines.md`
  - `.trellis/spec/backend/error-handling.md`
  - `.trellis/spec/backend/quality-guidelines.md`
  - `.trellis/spec/guides/test-driven-development-guide.md`
  - `.trellis/spec/guides/worktree-usage-guide.md`

## Implementation Guidance for Agent

- Use TDD where feasible: start with tests around CLI parsing/host storage/session status behavior before implementation.
- Keep each subtask independently reviewable.
- Do not commit.
- Preserve user-facing MCP behavior where practical, but do not let MCP dictate the architecture.
- Avoid logging passwords/private keys or command outputs outside per-session user logs.
