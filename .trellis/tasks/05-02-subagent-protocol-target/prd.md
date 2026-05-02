# update subagent protocol target

## Goal

Update the Opencode hook protocol so sub-agent handoff files use only the `~/.agent-messages` target.

## What I already know

* The current hook protocol is defined in `.claude/hooks/inject-subagent-context.py` and `session-start.py`.
* The current wording points agents at `./agent-message-[word].md` and `~/.claude/agent-msg/agent-message-[word].md`.
* There is also a related reminder in `.claude/hooks/inject-workflow-state.py`.

## Assumptions (temporary)

* The destination should be `~/.agent-messages/agent-message-[word].md` only.
* The hook-side generator helper should print the same destination so the protocol stays consistent.

## Requirements (evolving)

* Update hook protocol text to match the new destination.
* Keep the wording consistent across the hook files that mention the handoff path.

## Acceptance Criteria (evolving)

* [ ] The hook protocol references `~/.agent-messages` instead of `~/.claude/agent-msg`.
* [ ] The code generator prints `~/.agent-messages` as the shared path.
* [ ] The hook wording is consistent across the edited hook files.

## Definition of Done

* Relevant hook files are updated.
* No unrelated protocol text is left inconsistent.

## Technical Notes

* Files inspected: `.claude/hooks/inject-subagent-context.py`, `.claude/hooks/session-start.py`, `.claude/hooks/inject-workflow-state.py`.
* Related docs also mention the old path, but this task is scoped to the hooks unless the user says otherwise.
