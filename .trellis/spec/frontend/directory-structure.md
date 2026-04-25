# Directory Structure

> How the CLI interface is organized.

---

## Overview

The "frontend" of this project is a Command Line Interface (CLI). This document outlines how CLI-specific code is organized.

---

## Directory Layout

```
src/
├── cli/            # CLI command definitions
│   ├── commands/   # Individual command handlers (start, exec, list, etc.)
│   ├── ui/         # CLI output formatting and UI components (tables, spinners)
│   └── index.ts    # CLI entry point and argument parsing
└── ...
```

---

## Module Organization

- **Commands**: Each major CLI command should have its own file in `src/cli/commands/`.
- **UI Components**: Reusable UI elements like table formatters or confirmation prompts live in `src/cli/ui/`.
- **Parsing**: Use a robust library like `commander` or `yargs` in `src/cli/index.ts`.

---

## Naming Conventions

- **Files**: `kebab-case.ts`.
- **Handlers**: `commandNameHandler`.

---

## Examples

### Command Handler
`src/cli/commands/start.ts`
```typescript
export async function startHandler(hostId: string, options: any) {
  // Logic to call backend service and format output
}
```
