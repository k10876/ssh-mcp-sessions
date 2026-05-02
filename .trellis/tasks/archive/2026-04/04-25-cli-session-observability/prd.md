# Session observability and death handling

## Goal

Make SSH sessions observable and safe to operate by logging lifecycle events, detecting unexpected death, and surfacing dead-session state clearly.

## Requirements

- Write per-session logs to `~/.ssh-cli-sessions/logs/<session-name>.log`.
- Log session start, each exec command, result summary, close/kill, timeout, and unexpected disconnect/death reason.
- Detect SSH `error`, `close`, and `end` events and mark sessions dead with reason.
- Keep recently dead sessions visible in `list` / `ps` output with status, reason, and log path.
- On next `exec` or `list`, surface a clear hook/notification-style message for dead sessions including log path.
- Ensure inactivity timeout defaults to 24 hours and is configurable via `SSH_CLI_MAX_INACTIVITY_MS`.
- Avoid logging passwords, private keys, or secrets in system logs.

## Acceptance Criteria

- [ ] Session log files are created under the target logs directory.
- [ ] Commands and lifecycle events produce timestamped log entries.
- [ ] Unexpected disconnects become dead-session records instead of disappearing silently.
- [ ] `list` / `ps` includes active and recently dead sessions.
- [ ] `exec` against a dead session reports the death reason and log path.
- [ ] Tests cover timeout config, dead-session transitions, and log-path reporting.
- [ ] `npm run build` and `npm test` pass.

## Dependencies

- Depends on or should be coordinated with core backend extraction.
- Parent PRD: `../04-25-agent-implementation-task/prd.md`

## Out of Scope

- Auto-reconnect.
- Cross-reboot persisted session resurrection.
