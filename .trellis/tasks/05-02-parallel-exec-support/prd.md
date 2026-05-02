# Parallel exec support

## Goal

Allow overlapping `ssh-cli exec` calls against the same named session to succeed by queueing them onto the existing persistent shell and running them one by one. This preserves remote shell state while removing the current `SessionBusyError` behavior for same-session contention.

## What I already know

* `PersistentSession` currently uses a single interactive SSH shell and a single `pendingCommand` slot.
* The current implementation rejects concurrent execution with `SessionBusyError`.
* The product requirement is to accept overlapping calls, especially exactly simultaneous ones, and serialize them.
* Existing behavior relies on shell reuse so `cd`, `export`, and similar state carry across `exec` calls.
* The current CLI `exec` path takes the command from argv, which makes complex shell payloads awkward because the local shell must parse and escape them before `ssh-cli` receives the string.
* There is no existing runtime YAML config loader for user-level CLI behavior.

## Assumptions (temporary)

* Serialization is required per session, not globally across all sessions.
* FIFO ordering is the expected behavior for overlapping calls.
* CLI output behavior does not need a new user-facing queue notice for this MVP.
* A file-backed command source is preferable to introducing a language-specific execution mode such as Python.
* Regex-driven reminders should be user-configurable rather than hard-coded for one keyword like `slurm`.

## Open Questions

* None currently blocking.

## Requirements

* Overlapping `execute()` calls on the same session must not throw a busy error solely because another command is in flight.
* Commands queued on the same session must run one at a time on the already-open shell.
* Command results must still map to the correct caller in submission order.
* Existing shell reuse semantics must remain intact so remote shell state continues across executions.
* Different named sessions must remain independently executable.
* `exec` must support a safer input mode that reads the command payload from a file instead of requiring the full payload to survive local shell escaping in argv.
* The safer input mode must still execute the file contents as shell input inside the remote persistent session.
* Existing inline `exec <command>` usage should continue to work.
* `exec` must support configurable reminder rules loaded from `~/.ssh-cli-sessions/config.yaml`.
* The config must allow multiple regex-based reminder rules.
* Each reminder rule must be able to match against exec input text, exec output text, or both.
* When a rule matches, its configured reminder text must be appended after the command output shown to the user.
* The implementation must not hard-code `slurm`; a `slurm` reminder should be achievable through config.

## Acceptance Criteria

* [ ] Two or more overlapping `execute()` calls against the same session all resolve successfully when the shell remains healthy.
* [ ] Overlapping calls on one session resolve in FIFO order and preserve shell state between commands.
* [ ] Existing missing-session and dead-session error behavior remains unchanged.
* [ ] Targeted tests cover the queued same-session execution path.
* [ ] `exec` can read command input from a file and preserves special characters/newlines without extra local shell escaping rules.
* [ ] `exec` loads reminder rules from `~/.ssh-cli-sessions/config.yaml` and appends matching reminder text after command output.
* [ ] Multiple reminder rules can coexist and independently match input/output content.

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green for affected scope
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Technical Approach

Replace the single-flight rejection in `PersistentSession` with a per-session FIFO promise chain. Each `execute()` call should enqueue work that waits for prior commands to complete before writing to the shared shell and awaiting its marker-delimited result.

Extend the CLI `exec` surface with a file-backed command source such as `--file <path>`, so callers can place arbitrarily complex shell input in a file and have `ssh-cli` read it locally before sending the exact contents into the remote persistent shell.

Add a small runtime config loader for `~/.ssh-cli-sessions/config.yaml`, validate the reminder rule shape, and apply matching rules in the `exec` run path after the command result is available.

## Decision (ADR-lite)

**Context**: The same persistent shell is required for stateful `exec` behavior, but that shell cannot safely run multiple interactive commands concurrently.

**Decision**: Keep one shell per session and serialize overlapping `execute()` calls through an internal queue instead of opening additional shells or rejecting concurrent calls.

**Decision**: Add a file-backed command input mode for `exec` instead of a language-specific mode like Python. This avoids local shell escaping problems without changing the remote execution model.

**Decision**: Implement configurable regex reminder rules in user config rather than baking keyword-specific behavior into the CLI. This keeps the feature general and lets users define their own submission/output reminders such as `slurm` workflows.

**Consequences**: Same-session overlap becomes safe and deterministic, while true parallel command execution within a single session remains out of scope. Complex command payloads can bypass local shell quoting by living in files, but users still run shell code remotely rather than Python-specific code. Reminder behavior becomes user-extensible, but config parsing and invalid-regex handling now need explicit tests.

## Out of Scope

* Running multiple commands simultaneously inside the same named session.
* Introducing extra SSH connections or shells per queued command.
* Changing the cross-session concurrency model.
* Adding a Python-specific remote execution surface.

## Technical Notes

* Primary implementation target: `src/services/session-service.ts`
* Primary implementation targets: `src/services/session-service.ts`, `src/cli/parse.ts`, `src/cli/run.ts`, `src/cli/types.ts`, `src/config.ts`
* Primary tests: `test/session-service.test.ts`, `test/cli-daemon.test.ts`, `test/cli.test.ts`, `test/config-and-host-store.test.ts`
* Relevant specs: backend session management, CLI interface, error handling, logging guidelines, and quality guidelines.
