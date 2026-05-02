# Session Management Guidelines

> Rules for persistent session handling and lifecycle.

## Overview

Sessions in `ssh-cli-sessions` are reusable SSH shells held by the shared session backend and exposed to higher-level interfaces.

## Persistence Rules

- **Storage**: Sessions are held in-memory by the owning backend process. The human CLI reaches that backend through a lightweight local daemon.
- **Naming**: The service layer requires a non-empty session name. Adapters may generate one before calling the service.
- **Logs**: Session logging is handled by later observability work; the core backend should expose stable session identities and lifecycle state.

## Lifecycle

- **Inactivity Timeout**: Sessions automatically terminate after **24 hours** of inactivity by default.
- **Configuration**: `SSH_CLI_MAX_INACTIVITY_MS` overrides the default only when it is a positive integer string.
- **Cleanup**: On explicit close or timeout, the service must close the SSH shell and underlying connection and clear timers/listeners.

## Scenario: Named in-memory session service contract

### 1. Scope / Trigger
- Trigger: session lifecycle is a shared backend contract used by the human CLI and any future adapters.

### 2. Signatures
- `new SessionService(timeoutMs = getMaxInactivityMs())`
- `SessionService.startSession(id: string, config: ConnectConfig): Promise<SessionInfo>`
- `SessionService.ensureSession(id: string, config: ConnectConfig): Promise<SessionInfo>`
- `SessionService.execute(id: string, command: string): Promise<CommandResult>`
- `SessionService.closeSession(id: string): Promise<void>`
- `SessionService.listSessions(): SessionInfo[]`
- `SessionService.getSessionInfo(id: string): SessionInfo`
- `SessionService.hasSession(id: string): boolean`

### 3. Contracts
- `SessionInfo` fields:
  - `id: string`
  - `host: string`
  - `port: number`
  - `username: string`
  - `createdAt: number`
  - `lastCommand: string | null`
  - `disposed: boolean`
- `CommandResult` fields:
  - `output: string`
  - `exitCode: number`
- Shell reuse contract:
  - repeated `execute` calls on the same session reuse the same SSH shell
  - session markers delimit command completion without creating a fresh SSH connection per command
- `SSH_CLI_MAX_INACTIVITY_MS`:
  - optional
  - accepted only when `^\d+$`
  - non-numeric, suffixed, zero, and negative values fall back to the 24h default

### 4. Validation & Error Matrix
- blank session id on `startSession` / `ensureSession` -> `SessionError`
- duplicate `startSession` id -> `SessionExistsError`
- missing session on `execute` / `closeSession` / `getSessionInfo` -> `SessionNotFoundError`
- concurrent command while another is pending -> `SessionBusyError`
- disposed session reused -> `SessionError`
- shell missing after connection setup -> `SessionError`

### 5. Good/Base/Bad Cases
- Good: start named session once, run multiple commands through the reused shell, close explicitly
- Base: `listSessions()` on a fresh service returns `[]`
- Bad: blank session name, starting the same named session twice, executing against a missing session

### 6. Tests Required
- Unit: timeout config falls back to 24h for invalid env values
- Unit: service rejects blank session names
- Unit: lookup operations on missing sessions raise `SessionNotFoundError`
- Unit: fresh service lists no sessions and `hasSession()` is false
- Integration: repeated `execute` calls on one session preserve remote shell state
- Assertion points:
  - duplicate ids fail at the service boundary
  - missing-session errors are stable for adapters to map
  - invalid env strings like `1234ms` do not partially parse as valid timeouts

### 7. Wrong vs Correct
#### Wrong
```typescript
const id = sessionId?.trim() || randomUUID();
await sessionService.startSession(id, config);
```

#### Correct
```typescript
const id = sessionId && sessionId.trim() ? sessionId.trim() : randomUUID();
await sessionService.startSession(id, config);
```

## Examples

### Session Startup (Service Boundary)
```typescript
const service = new SessionService();
await service.startSession('my-dev-session', hostConfig);
```

### Reusing a Session
```typescript
await service.ensureSession('my-dev-session', hostConfig);
const result = await service.execute('my-dev-session', 'pwd');
```
