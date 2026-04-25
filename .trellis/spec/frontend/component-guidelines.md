# CLI Component Guidelines

> How to build human-friendly CLI outputs.

---

## Overview

The CLI components are responsible for presenting information to the user in a clear, actionable format.

---

## Output Patterns

- **Tables**: Use for listing hosts and sessions. Ensure columns are aligned and headers are clear.
- **Spinners**: Use for long-running network operations (e.g., connecting to SSH).
- **Colors**: Use colors (via `chalk` or similar) to highlight important info (success: green, error: red, id: cyan).
- **Interactive Prompts**: Use for confirmation (e.g., before executing a dangerous command in auto mode) or for entering missing info.

---

## Component Structure

Keep UI logic separate from business logic. A "component" in this context is a function that takes data and returns a formatted string or manages an interactive prompt.

---

## Common Mistakes

- **Wall of Text**: Avoid dumping raw output without formatting.
- **Missing Feedback**: Never leave the user wondering if the process is hung; use spinners or progress messages.
- **Inconsistent Colors**: Use a consistent color palette for status messages.
