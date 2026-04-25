# Core backend extraction for ssh-cli-sessions

## Goal

Extract reusable backend modules from the current MCP-first `src/index.ts` so both the human CLI and optional MCP mode share one host/session implementation.

## Requirements

- Split core logic into modules consistent with `.trellis/spec/backend/directory-structure.md`.
- Create shared types for stored hosts, session info, command results, dead-session state, and config.
- Move host persistence to `~/.ssh-cli-sessions/hosts.json` with Zod validation.
- Use atomic writes and restricted permissions where feasible.
- Move path expansion and command sanitization into utilities.
- Create a session service that owns named in-memory sessions and exposes start, exec, list/ps, kill/close, and lookup operations.
- Preserve shell reuse semantics so repeated exec calls share remote shell state.
- Default max inactivity to 24 hours via `SSH_CLI_MAX_INACTIVITY_MS`.
- Do not keep interface-specific MCP errors in core service code; adapters should map core errors to CLI/MCP formats.

## Acceptance Criteria

- [ ] `src/index.ts` is no longer the home of host storage/session business logic.
- [ ] Core modules compile under TypeScript strict settings.
- [ ] Host store uses `~/.ssh-cli-sessions/hosts.json`, validates with Zod, and avoids logging secrets.
- [ ] Session service requires named sessions and exposes reusable methods for CLI and MCP.
- [ ] Unit tests cover path expansion, command sanitization, host parsing, and timeout config.
- [ ] `npm run build` passes.

## Dependencies

- Parent PRD: `../04-25-agent-implementation-task/prd.md`

## Out of Scope

- Full CLI command UX.
- MCP tool registration.
- README rewrite.
