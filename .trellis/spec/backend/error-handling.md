# Error Handling

> How errors are handled in this project.

---

## Overview

<!--
Document your project's error handling conventions here.

Questions to answer:
- What error types do you define?
- How are errors propagated?
- How are errors logged?
- How are errors returned to clients?
-->

(To be filled by the team)

---

## Error Types

- **McpError**: Used when running in MCP mode to return standard protocol errors (e.g., `ErrorCode.InvalidParams`, `ErrorCode.InternalError`).
- **ConnectionError**: Specific error for SSH connectivity issues (e.g., timeout, auth failure).
- **SessionError**: Errors related to session lifecycle (not found, already exists, timeout).
- **CLIError**: Error class for CLI-specific issues with user-friendly messages.

---

## Error Handling Patterns

- **CLI Mode**: Catch top-level errors in `src/index.ts` (or the CLI entry point) and print user-friendly messages to `stderr` before exiting with a non-zero code. Use colors for error reporting if possible.
- **MCP Mode**: Throw `McpError` to be handled by the MCP SDK.
- **Cleanup**: Always use `try...finally` or `disposables` to ensure SSH connections are closed even if an error occurs.
- **Robustness**: If a session fails, attempt to provide a reason (e.g., "Host unreachable" vs "Auth failed").

---

## Common Mistakes

- **Swallowing Errors**: Avoid empty `catch` blocks.
- **Generic Error Messages**: "Something went wrong" is unhelpful. Always include context (e.g., "Failed to connect to host 'dev-box'").
- **Exposing Secrets**: Ensure error messages don't leak passwords or private keys.
