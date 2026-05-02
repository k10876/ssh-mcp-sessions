# make local attach reuse stored auth material

## Goal

Fix `ssh-cli attach` so the local-side interactive SSH connection reuses the stored host authentication details instead of falling back to an unexpected password prompt.

## What I already know

- The current attach implementation launches a fresh local `ssh` command inside local tmux.
- That fresh local `ssh` command only uses `user@host` and `port`, so it ignores stored `password` and `keyPath` data from the host store.
- Host data is currently stored in `~/.ssh-cli-sessions/hosts.json` with filesystem permissions tightened to `0700` on the directory and `0600` on the file.
- Stored passwords are currently plain text in `hosts.json`; they are not encrypted by the application.
- The daemon-backed shared session backend must remain intact for `start` / `exec` continuity.

## Requirements

- `ssh-cli attach` must reuse stored auth details for the matched host when opening the local interactive SSH connection.
- Password-auth hosts must not unexpectedly reprompt just because attach uses a fresh local SSH process.
- Key-path hosts must continue to work.
- Local-side tmux ownership should remain in place; do not reintroduce remote tmux.
- Keep the implementation minimal and practical for Linux CLI users.
- If secure non-interactive password reuse for local `ssh` requires an explicit local helper such as `sshpass` or `SSH_ASKPASS`, handle missing prerequisites clearly.
- Update docs and tests to reflect the real storage/auth behavior.

## Acceptance Criteria

- [ ] Attach no longer ignores stored auth material for matched hosts.
- [ ] Active source paths do not require remote tmux.
- [ ] Password-auth attach has a concrete, implemented behavior instead of silently prompting as if no password were stored.
- [ ] Existing session commands (`start`, `exec`, `list`, `kill`, `logs`) still work unchanged.
- [ ] Targeted tests pass for CLI and attach behavior.
- [ ] `npm run build` passes.

## Technical Approach

Keep local tmux for human attach, but make the spawned local SSH command auth-aware. Resolve the matched host record and build the local SSH invocation from that record, including key-path support and an explicit password-handling path for password-auth hosts.

## Decision (ADR-lite)

**Context**: Local attach is a separate direct SSH connection, so unlike daemon-backed `exec`, it does not automatically inherit the stored `ssh2` credentials unless the CLI passes them through deliberately.

**Decision**: Preserve local attach, but teach it to reuse the stored host auth details rather than assuming agent/no-password auth.

**Consequences**: Attach remains compatible with locked-down remotes and becomes consistent with saved host configuration, but password-based attach may require a local helper or explicit UX constraints.

## Out of Scope

- Encrypting existing stored passwords at rest.
- Rewriting the core session backend away from the existing daemon/shared-session design.
- Cross-reboot persistence.

## Technical Notes

- Likely files: `src/cli/io.ts`, `src/services/host-store.ts`, `README.md`, related CLI tests.
- Be explicit about where passwords are stored today and whether any local helper dependency is introduced.
