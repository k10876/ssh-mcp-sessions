# move attach tmux ownership to the local machine

## Goal

Remove the current remote-`tmux` requirement from `ssh-cli attach` so restrictive remote hosts do not need to install `tmux`. The local machine should own any `tmux` usage needed for an interactive attach workflow, while preserving the existing human CLI session model.

## What I already know

- `src/cli/io.ts` currently prints `ssh -t ... "tmux attach ... || tmux new ..."`, which explicitly requires `tmux` on the remote host.
- `src/cli/run.ts` contains the same remote-`tmux` fallback attach command.
- The product requirement is that remote environments may be restrictive, so local tooling can be assumed more readily than remote packages.
- The daemon-backed shared session backend must remain intact for `start` / `exec` continuity.

## Requirements

- `ssh-cli attach` must no longer require `tmux` on the remote machine.
- Any `tmux` integration for attach should run on the local side only.
- Preserve the existing human CLI commands and daemon-backed shared session model.
- Keep the implementation minimal and practical for Linux CLI users.
- Update docs and tests to describe the new attach behavior accurately.

## Acceptance Criteria

- [ ] No active source path prints or executes a remote `tmux attach` / `tmux new` command.
- [ ] `ssh-cli attach` gives a working local-side attach workflow that does not assume remote `tmux` is installed.
- [ ] Existing session commands (`start`, `exec`, `list`, `kill`, `logs`) still work unchanged.
- [ ] Targeted tests pass for CLI and attach behavior.
- [ ] `npm run build` passes.

## Technical Approach

Replace the current remote-`tmux` attach instructions with a local-side wrapper approach. The attach command should produce or run a local workflow that uses local `tmux` if needed and opens a direct interactive SSH connection to the remote shell without depending on remote `tmux` packages.

## Decision (ADR-lite)

**Context**: Remote `tmux` is unacceptable in restrictive environments, but local terminal tooling is acceptable for human operators.

**Decision**: Move attach-session multiplexing responsibility to the local machine and stop generating remote `tmux` commands.

**Consequences**: Attach becomes compatible with locked-down remotes, but the exact interactive experience may differ from the old remote-session model.

## Out of Scope

- Rewriting the core session backend away from the existing daemon/shared-session design.
- Cross-reboot persistence.
- Automatic interactive terminal proxying beyond the chosen local attach workflow.

## Technical Notes

- Likely files: `src/cli/io.ts`, `src/cli/run.ts`, `README.md`, related CLI tests.
- Review whether local attach should be instruction-only or an actively launched local `tmux` command.
