# Directory Structure

> How backend code is organized in this project.

---

## Overview

<!--
Document your project's backend directory structure here.

Questions to answer:
- How are modules/packages organized?
- Where does business logic live?
- Where are API endpoints defined?
- How are utilities and helpers organized?
-->

(To be filled by the team)

---

## Directory Layout

```
src/
├── index.ts        # Entry point (CLI & MCP Server)
├── types/          # Shared type definitions (e.g., StoredHost, SessionInfo)
├── services/       # Core logic (SSH connection handling, Session lifecycle)
├── cli/            # CLI command definitions (ssh-cli commands)
├── mcp/            # MCP tool definitions (standard MCP interface)
└── utils/          # Helpers (path expansion, command sanitization)
```

---

## Module Organization

- **Core Logic**: Keep SSH connection handling (`PersistentSession` class) and session state management independent of the interface (CLI/MCP). These should live in `src/services/`.
- **CLI Commands**: Define the human-friendly interface separately in `src/cli/`. Each command (e.g., `start`, `exec`) should have its own handler.
- **MCP Tools**: Define MCP tools in `src/mcp/` that wrap the core services.
- **Shared Types**: Use `src/types/` for data structures that move across these layers.

---

## Naming Conventions

- **Files**: Use `kebab-case.ts` for all source files.
- **Classes**: Use `PascalCase` (e.g., `PersistentSession`).
- **Functions**: Use `camelCase` (e.g., `sanitizeCommand`).
- **Interfaces/Types**: Use `PascalCase`.

---

## Examples

### Core Service (Aspirational)
`src/services/session.ts`
```typescript
export class PersistentSession {
  // ... session logic ...
}
```

### CLI Command (Aspirational)
`src/cli/start.ts`
```typescript
import { sessionService } from '../services/session';

export async function startCommand(hostId: string) {
  // ... handler ...
}
```
