# MCP compatibility mode for ssh-cli

## Goal

Keep LLM-agent access available through explicit MCP server mode while making the human CLI the primary interface.

## Requirements

- Move MCP server/tool registration into `src/mcp/` or equivalent module.
- Start MCP stdio server only through explicit mode such as `ssh-cli mcp`.
- Reuse shared host/session services for MCP operations.
- Preserve practical compatibility for current MCP tools where reasonable: add/list/remove/edit hosts, start session, exec, close session, list sessions.
- Map core service errors to `McpError` at the MCP adapter boundary.
- Ensure MCP mode uses `~/.ssh-cli-sessions` storage/log paths.

## Acceptance Criteria

- [ ] Default CLI invocation does not start MCP stdio server.
- [ ] `ssh-cli mcp` starts the MCP server on stdio.
- [ ] MCP tools use shared backend services, not separate state implementations.
- [ ] MCP errors are protocol-appropriate while core services stay protocol-neutral.
- [ ] Tests cover MCP adapter behavior around at least host registration, exec error mapping, and list sessions.
- [ ] `npm run build` and `npm test` pass.

## Dependencies

- Depends on core backend extraction.
- Parent PRD: `../04-25-agent-implementation-task/prd.md`

## Out of Scope

- Making MCP the primary product interface.
- Adding new MCP-only features beyond parity with CLI/session backend.
