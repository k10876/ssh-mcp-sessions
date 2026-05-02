# diagnose ssh-cli direct SFTP relative path mismatch

## Goal

Understand why `ssh-cli get --host hpc interface ...` fails with `No such file` while `ssh-cli exec test pwd` shows a session working directory where `interface` exists.

## What I already know

* `exec` runs inside a named persistent shell session and preserves that shell's current working directory.
* `get` is implemented as a direct SFTP host operation and does not attach to a named shell session.
* The earlier callback-based SFTP runtime bug has already been fixed.
* Reproduction now returns `No such file` instead of crashing.

## Requirements

* Reproduce the mismatch clearly.
* Identify whether the issue is expected behavior, a UX/documentation gap, or an implementation bug.
* If the behavior is wrong, fix it minimally and verify.

## Acceptance Criteria

* [ ] Root cause is identified with evidence from the current code and runtime behavior.
* [ ] Any required fix or doc clarification is implemented and verified.

## Technical Notes

* Relevant files: `src/cli/transfer.ts`, `src/cli/run.ts`, `README.md`, transfer tests.
