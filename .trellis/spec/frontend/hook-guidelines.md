# Hook Guidelines (CLI Context)

> Patterns for reusable CLI interaction logic.

---

## Overview

In the context of our CLI, "hooks" are reusable logic patterns for managing terminal interactions.

---

## Pattern: `usePrompt`

Reusable logic for asking user questions.

```typescript
export async function confirmDangerousCommand(command: string): Promise<boolean> {
  // Logic to show command and ask for Y/N
}
```

---

## Pattern: `useLoading`

Reusable logic for wrapping async operations with a spinner.

```typescript
export async function withLoading<T>(label: string, task: () => Promise<T>): Promise<T> {
  // Start spinner, run task, stop spinner
}
```

---

## Naming Conventions

- Prefix with `use` if they manage stateful interaction (though less strict than React hooks).
- Use descriptive names like `confirmAction`, `formatTable`.
