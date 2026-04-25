# Type Safety

> TypeScript patterns for CLI and MCP interfaces.

---

## Overview

We use TypeScript to ensure type safety across the CLI, MCP server, and core services.

---

## Type Organization

- **`src/types/`**: Contains shared interfaces (e.g., `StoredHost`, `SessionInfo`, `CommandResult`).
- **`src/cli/types.ts`**: CLI-specific types (e.g., `CommandOptions`).

---

## Validation

- **Zod**: Mandatory for validating:
    - Input from the CLI (args and flags).
    - Input from MCP tools.
    - Data read from `hosts.json`.

---

## Forbidden Patterns

- **`any`**: Strictly forbidden. Use `unknown` or specific interfaces.
- **`as` assertions**: Avoid unless dealing with external libraries that have incomplete types.

---

## Examples

### Validating CLI Input
```typescript
const StartOptionsSchema = z.object({
  name: z.string().optional(),
  timeout: z.number().int().positive().default(24),
});
```
