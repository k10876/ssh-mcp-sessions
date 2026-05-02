# fix ssh-cli get/put callback-based sftp bug

## Goal

Fix the `ssh-cli get` and `ssh-cli put` runtime bug caused by treating `ssh2` SFTP methods as promise-based, so built CLI transfers work against real stored hosts and fail with the intended user-facing errors.

## What I already know

* `src/cli/transfer.ts` currently awaits `sftp.stat`, `fastGet`, `fastPut`, `readdir`, and `mkdir` directly.
* Running `node build/index.js get --host hpc interface /data/home/zhuangzhuanghu/a_b_120-1-12_interface_0.04` throws `Cannot read properties of undefined (reading 'isDirectory')`.
* `ssh2` exposes callback-based SFTP APIs, so the current direct `await` logic is invalid for the real runtime object.
* Existing unit tests only covered promise-shaped mocked SFTP clients, so the real runtime shape was not exercised.

## Requirements

* Add regression coverage for the real callback-style SFTP API shape.
* Adapt the runtime SFTP client into the promise-based internal transfer interface.
* Keep the CLI command surface unchanged.
* Preserve current transfer logging and error messages.
* Reproduce the original command after the fix and verify it no longer throws the callback-shape runtime error.

## Acceptance Criteria

* [ ] New regression test fails before the fix and passes after it.
* [ ] `get` and `put` use a promise-adapted SFTP wrapper for `ssh2` runtime clients.
* [ ] The reproduced `get` command no longer throws `Cannot read properties of undefined (reading 'isDirectory')`.
* [ ] Relevant tests, typecheck, and build pass.

## Definition of Done

* Regression tests added.
* Minimal implementation change merged into the transfer module.
* Verification command rerun.

## Technical Notes

* Likely touched files: `src/cli/transfer.ts`, `test/transfer.test.ts`.
* Relevant guidance: backend error handling, logging guidance, TDD guide.
