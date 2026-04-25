# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

`ssh-cli-sessions` does not use a traditional RDBMS. It uses file-based persistence for host configurations and session logs.

---

## File-Based Persistence

- **Hosts**: Stored in `~/.ssh-mcp/hosts.json` as a JSON array.
- **Session Logs**: Stored in `~/.ssh-cli-sessions/logs/` as plain text files.

---

## Data Integrity Patterns

- **Atomic Writes**: When updating `hosts.json`, ensure the write is atomic (e.g., write to a temp file and rename) to prevent corruption if the process crashes.
- **Schema Validation**: Always validate the content of `hosts.json` using Zod when reading.
- **Permission Management**: Ensure `hosts.json` and the logs directory have restricted permissions (e.g., `0600` for the file, `0700` for the directory).

---

## Common Mistakes

- **Concurrent Access**: Multiple instances of the server/CLI might attempt to write to `hosts.json` simultaneously. Use file locking if necessary.
- **Manual Edits**: Users might manually edit `hosts.json`. The code should handle malformed JSON gracefully.
