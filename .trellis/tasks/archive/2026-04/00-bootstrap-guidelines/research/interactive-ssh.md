# Research: Spawning Interactive SSH in Node.js

- **Query**: How to spawn an interactive SSH process in Node.js that inherits the parent's TTY (ideally attaching to tmux)?
- **Scope**: External (Node.js/Unix)
- **Date**: 2026-04-25

## Findings

### Best Approach: `child_process.spawn` with `{ stdio: 'inherit' }`

To spawn a truly interactive SSH process where the user interacts directly with the remote shell, use the native `ssh` binary via Node's `child_process.spawn`. Passing `{ stdio: 'inherit' }` ensures the child process shares the `stdin`, `stdout`, and `stderr` of the Node parent, which in turn inherits the TTY properties.

#### Code Example

```javascript
import { spawn } from 'child_process';

const sshProcess = spawn('ssh', ['-t', 'user@host', 'tmux attach -t session-name || tmux new -s session-name'], {
  stdio: 'inherit'
});

sshProcess.on('exit', (code) => {
  console.log(`SSH session exited with code ${code}`);
  process.exit(code);
});
```

### Key Flags and Details

- **`-t` (Force TTY allocation)**: Crucial when running commands like `tmux` over SSH. Without this, SSH might not allocate a remote PTY, causing interactive tools to fail.
- **`stdio: 'inherit'`**: This is the "magic" in Node.js that makes the sub-process interactive by connecting it directly to the terminal where the Node process is running.
- **Command String**: Using `tmux attach -t <name> || tmux new -s <name>` is a standard pattern to either resume an existing session or start a new one.

### Alternative: `node-pty` (For PTY Emulation)

If you need to programmatically interact with the SSH stream *while* displaying it to the user (e.g., for logging or automation), use the `node-pty` library. However, for a simple "attach" command, `spawn` is cleaner as it avoids native dependencies.

### Related Specs

- (No existing spec for this CLI command found in `.trellis/spec/`)

## Caveats / Not Found

- The current project `ssh-mcp-sessions` uses the `ssh2` library for its MCP tools. `ssh2` is excellent for programmatic control but difficult to use for "inheriting" a parent TTY for a human-interactive session. For a CLI `attach` command, spawning the system `ssh` binary is generally preferred over using a JS-only SSH client.
- SSH Agent forwarding should be handled by adding `-A` to the `spawn` arguments if required.
