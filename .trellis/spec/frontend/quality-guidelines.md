# Quality Guidelines (CLI)

> Standards for CLI user experience and code quality.

---

## Overview

The quality of the CLI is measured by its usability, reliability, and clear feedback.

---

## Forbidden Patterns

- **Silent Failures**: Never fail without an error message.
- **Unformatted Errors**: Don't just dump a stack trace to the user. Print a human-friendly message first.
- **Blocking the UI**: Never perform long-running operations on the main thread without feedback.

---

## Required Patterns

- **Help Text**: Every command must have comprehensive help text.
- **Verbose Mode**: Support a `--verbose` flag for debugging.
- **Exit Codes**: Use standard exit codes (0 for success, 1 for general error, etc.).
- **Signal Handling**: Handle `SIGINT` (Ctrl+C) gracefully to clean up connections.

---

## Testing Requirements

- **Snapshots**: Use snapshot testing for CLI output formatting.
- **E2E Tests**: Use `execa` or similar to run the CLI against a mock SSH server.
