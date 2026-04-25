# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

`ssh-cli-sessions` does not use a traditional RDBMS. It uses file-based persistence for host configurations and session logs.

---

## File-Based Persistence

- **Hosts**: Stored in `~/.ssh-cli-sessions/hosts.json` as a wrapped JSON object.
- **Session Logs**: Stored in `~/.ssh-cli-sessions/logs/` as plain text files.

---

## Data Integrity Patterns

- **Atomic Writes**: When updating `hosts.json`, write to a temp file in the same directory and rename it into place.
- **Schema Validation**: Always validate the content of `hosts.json` using Zod when reading.
- **Permission Management**: Ensure `hosts.json` and the config directory use restricted permissions where feasible (`0600` for the file, `0700` for the directory).

---

## Scenario: Host store backend contract

### 1. Scope / Trigger
- Trigger: file-based storage is a backend infra contract shared by MCP now and CLI later.

### 2. Signatures
- `new HostStore(options?: { hostsDir?: string; hostsFile?: string })`
- `HostStore.ensureStore(): Promise<void>`
- `HostStore.listHosts(): Promise<StoredHost[]>`
- `HostStore.saveHosts(hosts: StoredHost[]): Promise<void>`
- `HostStore.getHost(hostId: string): Promise<StoredHost>`
- `HostStore.getConnectConfig(hostId: string): Promise<ConnectConfig>`

### 3. Contracts
- Default directory: `~/.ssh-cli-sessions`
- Default host file: `~/.ssh-cli-sessions/hosts.json`
- File shape:
  - `{ "hosts": StoredHost[] }`
- `StoredHost` fields:
  - `id: string`
  - `host: string`
  - `port: positive integer` (default `22`)
  - `username: string`
  - `password?: string`
  - `keyPath?: string`
- Auth resolution in `getConnectConfig`:
  - `password` wins when present
  - else `keyPath` is expanded and read as `privateKey`
  - else `SSH_AUTH_SOCK` is used as agent auth when available

### 4. Validation & Error Matrix
- `hosts.json` path exists but is not a file -> `HostStoreError`
- JSON parse failure -> `HostStoreError`
- Zod validation failure -> `HostStoreError`
- requested host id missing -> `HostNotFoundError`
- expanded private-key path missing/unreadable -> `HostStoreError`
- atomic temp-file write/rename failure -> `HostStoreError`

### 5. Good/Base/Bad Cases
- Good: wrapped payload `{ "hosts": [{ "id": "dev", "host": "example.com", "port": 22, "username": "alice" }] }`
- Base: `{ "hosts": [] }`
- Bad: raw top-level array, malformed JSON, non-string `id`, non-positive `port`

### 6. Tests Required
- Unit: empty store creates `hosts.json` and returns `[]`
- Unit: malformed `hosts.json` fails with `HostStoreError`
- Unit: wrapped payload round-trips through `saveHosts`/`listHosts`
- Unit: `getConnectConfig` resolves password, key-path, and SSH agent branches
- Assertion points:
  - JSON must stay wrapped under `hosts`
  - invalid content must fail before use
  - missing host id must raise `HostNotFoundError`

### 7. Wrong vs Correct
#### Wrong
```typescript
await writeFile(hostsFile, JSON.stringify(hosts), 'utf8');
```

#### Correct
```typescript
const payload = { hosts };
await writeFile(tempFile, JSON.stringify(payload, null, 2), { mode: 0o600 });
await rename(tempFile, hostsFile);
```

---

## Common Mistakes

- **Concurrent Access**: Multiple instances of the server/CLI might attempt to write to `hosts.json` simultaneously. Use file locking if necessary.
- **Manual Edits**: Users might manually edit `hosts.json`. The code should handle malformed JSON gracefully.
