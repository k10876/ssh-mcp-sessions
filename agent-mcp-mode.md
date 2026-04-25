- Files: src/index.ts; src/mcp/adapter.ts; src/mcp/server.ts;
  test/mcp.test.ts.
    - Integration: MCP now starts only through explicit ssh-cli mcp
  behavior in src/index.ts; shared services remain the source of
    truth for host/session state and ~/.ssh-cli-sessions paths; CLI/docs
  owners should document MCP as secondary mode and wire the CLI
    mcp subcommand to this entrypoint without reintroducing MCP-first
  startup; MCP tests added cover host registration, exec error
    mapping to McpError, list sessions, and explicit mode startup
  behavior.
    - Validation: Ran cross-env SSH_MCP_DISABLE_MAIN=1 npx vitest --run
  test/mcp.test.ts → passed; ran npm --prefix
    "/home/k10876/ssh-cli-sessions/.claude/worktrees/agent-a72db21eeb009f
  241" test → passed (5 files, 21 tests); ran npm --prefix
    "/home/k10876/ssh-cli-sessions/.claude/worktrees/agent-a72db21eeb009f
  241" run build → passed.