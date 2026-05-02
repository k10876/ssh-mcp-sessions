# add ssh-cli put/get file transfer

## Goal

Add first-class file and directory transfer commands to `ssh-cli` so users can upload and download content against a stored host without dropping down to separate `scp` or ad-hoc tools.

## What I already know

* The CLI is a TypeScript package built around `ssh2`.
* Existing command parsing lives in `src/cli/parse.ts` and dispatch lives in `src/cli/run.ts`.
* Stored host auth is already centralized in `src/services/host-store.ts` via `getConnectConfig(hostId)`.
* Session reuse is shell-oriented, so transfer should be a direct host operation rather than a session operation.
* Local Trellis guidance expects TDD for feasible behavior changes and doc/spec updates when conventions change.

## Requirements

* Add `ssh-cli put --host <host> <local-path> <remote-path> [--recursive]`.
* Add `ssh-cli get --host <host> <remote-path> <local-path> [--recursive]`.
* Use SFTP over the stored host connection.
* Support file transfer and recursive directory transfer.
* Reject directory transfer without `--recursive`.
* Reuse existing stored-host authentication handling.
* Record transfer operations in persistent logs without leaking passwords or private key contents.
* Update user-facing docs and Trellis reference/spec docs for the new commands and logging behavior.

## Acceptance Criteria

* [ ] `parseCliArgs()` parses valid `put` and `get` commands with `--host` and optional `--recursive`.
* [ ] CLI dispatch invokes the configured transfer handlers and reports success clearly.
* [ ] Upload/download directory transfers fail clearly when `--recursive` is missing.
* [ ] Transfer logging records operation, host id, and source/destination paths without secrets.
* [ ] README/help text document the new commands and behavior.
* [ ] Relevant tests pass.

## Definition of Done

* Tests added or updated for parser/dispatch/transfer behavior.
* Build and test commands pass.
* README and Trellis docs updated for behavior and conventions.

## Technical Approach

Add a dedicated transfer module that opens a direct `ssh2` client using `HostStore.getConnectConfig(hostId)`, creates an SFTP session, and performs file or recursive directory copy. Keep transfer concerns separate from the persistent shell session service.

## Decision (ADR-lite)

**Context**: The project needs remote file transfer, but the existing session service is designed for shell reuse rather than file APIs.

**Decision**: Implement `put` and `get` as direct SFTP host operations, not as session-bound features.

**Consequences**: This keeps the change isolated and low-risk, reuses existing host auth, and avoids overloading session semantics. Transfer logs need their own host-level path because the operation is not tied to a session log.

## Out of Scope

* Rsync-style delta sync
* Resume/retry support
* Progress bars
* Globbing/exclude patterns
* Port forwarding or tunnel-based copy flows

## Technical Notes

* Files inspected: `src/cli/parse.ts`, `src/cli/run.ts`, `src/cli/io.ts`, `src/services/host-store.ts`, `src/services/session-service.ts`, `src/cli/formatting.ts`, `test/cli.test.ts`.
* Relevant specs: backend CLI interface, error handling, logging guidelines, TDD guide.
