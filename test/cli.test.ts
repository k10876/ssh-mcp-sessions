import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { CLIError, ValidationError } from '../src/errors.js';
import { createAttachFallbackMessage, createAttachSession } from '../src/cli/io.js';
import { parseCliArgs } from '../src/cli/parse.js';
import { runCliCommand, type CliDependencies } from '../src/cli/run.js';
import type { CliTransferOptions } from '../src/cli/types.js';
import type { StoredHost } from '../src/types/host.js';

function createDeps(overrides: Partial<CliDependencies> = {}): CliDependencies {
  const savedHosts: StoredHost[][] = [];
  const hostStore = {
    listHosts: vi.fn(async () => []),
    saveHosts: vi.fn(async (hosts: StoredHost[]) => {
      savedHosts.push(hosts);
    }),
    getHost: vi.fn(async (hostId: string) => ({ id: hostId, host: 'example.com', port: 22, username: 'alice' })),
    getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
  };

  const sessionService = {
    startSession: vi.fn(async (id: string) => ({
      id,
      host: 'example.com',
      port: 22,
      username: 'alice',
      createdAt: 1,
      lastCommand: null,
      disposed: false,
    })),
    execute: vi.fn(async () => ({ output: 'ok', exitCode: 0 })),
    closeSession: vi.fn(async () => undefined),
    getSessionInfo: vi.fn((id: string) => ({
      id,
      host: 'example.com',
      port: 22,
      username: 'alice',
      createdAt: 1,
      lastCommand: 'pwd',
      disposed: false,
    })),
    listSessions: vi.fn(() => []),
    listDeadSessions: vi.fn(() => []),
    consumeNotifications: vi.fn(() => []),
  };

  let stdoutText = '';
  let stderrText = '';

  return {
    hostStore,
    sessionService,
    packageVersion: '1.2.3',
    executableName: 'ssh-cli',
    env: {},
    stdout: { write: (chunk: string) => void (stdoutText += chunk) },
    stderr: { write: (chunk: string) => void (stderrText += chunk) },
    readLogs: vi.fn(async () => 'line1\nline2'),
    attachSession: vi.fn(async () => undefined),
    putPath: vi.fn(async (_options: CliTransferOptions) => "Uploaded '/tmp/file.txt' to 'dev:/remote/file.txt'"),
    getPath: vi.fn(async (_options: CliTransferOptions) => "Downloaded 'dev:/remote/file.txt' to '/tmp/file.txt'"),
    loadUserConfig: vi.fn(async () => ({ exec: { reminders: [] } })),
    ...overrides,
    get __stdout() {
      return stdoutText;
    },
    get __stderr() {
      return stderrText;
    },
    get __savedHosts() {
      return savedHosts;
    },
  } as CliDependencies & {
    __stdout: string;
    __stderr: string;
    __savedHosts: StoredHost[][];
  };
}

describe('cli parsing', () => {
  it('parses add-host with auth flags', () => {
    expect(parseCliArgs(['add-host', 'dev', '--host', 'alice@example.com', '--port', '2200', '--key-path', '~/.ssh/id_ed25519'])).toEqual({
      kind: 'add-host',
      name: 'dev',
      username: 'alice',
      options: {
        host: 'example.com',
        port: 2200,
        keyPath: '~/.ssh/id_ed25519',
      },
    });
  });

  it('parses exec with opt-in auto mode', () => {
    expect(parseCliArgs(['exec', 'dev-shell', '--auto', 'pwd'])).toEqual({
      kind: 'exec',
      sessionName: 'dev-shell',
      command: 'pwd',
      options: { auto: true },
    });
  });

  it('parses exec file mode', () => {
    expect(parseCliArgs(['exec', 'dev-shell', '--auto', '--file', './script.sh'])).toEqual({
      kind: 'exec',
      sessionName: 'dev-shell',
      command: '',
      options: { auto: true, filePath: './script.sh' },
    });
  });

  it('parses list aliases and logs options', () => {
    expect(parseCliArgs(['ps'])).toEqual({ kind: 'list' });
    expect(parseCliArgs(['logs', 'dev-shell', '--lines', '50', '--follow'])).toEqual({
      kind: 'logs',
      sessionName: 'dev-shell',
      options: { lines: 50, follow: true },
    });
  });

  it('parses put and get transfer commands', () => {
    expect(parseCliArgs(['put', '--host', 'dev', './local.txt', '/tmp/remote.txt'])).toEqual({
      kind: 'put',
      options: { host: 'dev', sourcePath: './local.txt', destinationPath: '/tmp/remote.txt', recursive: false },
    });

    expect(parseCliArgs(['get', '--host', 'dev', '--recursive', '/var/data', './downloads'])).toEqual({
      kind: 'get',
      options: { host: 'dev', sourcePath: '/var/data', destinationPath: './downloads', recursive: true },
    });
  });

  it('rejects invalid host syntax', () => {
    expect(() => parseCliArgs(['add-host', 'dev', '--host', 'example.com'])).toThrow('Host must be in the form user@host');
  });

  it('rejects missing exec commands', () => {
    expect(() => parseCliArgs(['exec', 'dev-shell'])).toThrow('exec requires a command or --file <path>');
  });

  it('rejects mixing exec file mode with inline command text', () => {
    expect(() => parseCliArgs(['exec', 'dev-shell', '--file', './script.sh', 'pwd'])).toThrow(
      'exec accepts either inline command text or --file <path>, not both',
    );
  });

  it('rejects blank session names for start', () => {
    expect(() => parseCliArgs(['start', '   ', '--host', 'dev'])).toThrow('start requires a session name');
  });

  it('rejects transfer commands without host or paths', () => {
    expect(() => parseCliArgs(['put', './local.txt', '/tmp/remote.txt'])).toThrow('put requires --host <host>');
    expect(() => parseCliArgs(['get', '--host', 'dev', '/tmp/remote.txt'])).toThrow('get requires a source path and destination path');
  });
});

describe('cli dispatch', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('writes help output', async () => {
    const deps = createDeps();

    const exitCode = await runCliCommand({ kind: 'help' }, deps);

    expect(exitCode).toBe(0);
    expect(deps.__stdout).toContain('Usage:');
    expect(deps.__stdout).toContain('add-host <name>');
  });

  it('adds a host through the shared host store', async () => {
    const deps = createDeps();

    const exitCode = await runCliCommand(
      {
        kind: 'add-host',
        name: 'dev',
        username: 'alice',
        options: { host: 'example.com', port: 22, keyPath: '~/.ssh/id_ed25519' },
      },
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.hostStore.saveHosts).toHaveBeenCalledOnce();
    expect(deps.__savedHosts[0]).toEqual([
      { id: 'dev', host: 'example.com', port: 22, username: 'alice', keyPath: '~/.ssh/id_ed25519' },
    ]);
    expect(deps.__stdout).toContain("Added host 'dev'");
  });

  it('starts a session using connect config from the host store', async () => {
    const deps = createDeps();

    const exitCode = await runCliCommand(
      { kind: 'start', sessionName: 'dev-shell', options: { host: 'dev' } },
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.hostStore.getConnectConfig).toHaveBeenCalledWith('dev');
    expect(deps.sessionService.startSession).toHaveBeenCalledWith('dev-shell', {
      host: 'example.com',
      port: 22,
      username: 'alice',
    });
  });

  it('prints exec output and returns failing exit codes', async () => {
    const deps = createDeps({
      env: { SSH_CLI_AI_AUTO_MODE: 'true' },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(async () => ({ output: 'boom', exitCode: 7 })),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn((id: string) => ({
          id,
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: 'pwd',
          disposed: false,
        })),
        listSessions: vi.fn(() => []),
        listDeadSessions: vi.fn(() => []),
        consumeNotifications: vi.fn(() => []),
      },
    });

    const exitCode = await runCliCommand(
      { kind: 'exec', sessionName: 'dev-shell', command: 'pwd', options: { auto: false } },
      deps,
    );

    expect(exitCode).toBe(7);
    expect(deps.__stdout).toContain('boom');
    expect(deps.__stderr).toContain('[ai-auto]');
    expect(deps.__stderr).toContain('exit code 7');
  });

  it('reads exec command text from a file and preserves exact contents', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-exec-file-'));
    const commandFile = join(tempDir, 'command.sh');
    const commandText = `printf "hello\\n"
printf "%s" "a$[]{};&|<>"\n`;
    await writeFile(commandFile, commandText, 'utf8');

    const deps = createDeps();

    const exitCode = await runCliCommand(
      { kind: 'exec', sessionName: 'dev-shell', command: '', options: { auto: false, filePath: commandFile } },
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.sessionService.execute).toHaveBeenCalledWith('dev-shell', commandText);
  });

  it('appends matching exec reminders after command output', async () => {
    const deps = createDeps({
      loadUserConfig: vi.fn(async () => ({
        exec: {
          reminders: [
            { when: 'input', pattern: 'sbatch', reminder: 'Use squeue to monitor the job.' },
            { when: 'output', pattern: 'Submitted batch job', reminder: 'Save the printed job id.' },
          ],
        },
      })),
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(async () => ({ output: 'Submitted batch job 42', exitCode: 0 })),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(),
        listSessions: vi.fn(() => []),
        listDeadSessions: vi.fn(() => []),
        consumeNotifications: vi.fn(() => []),
      },
    });

    const exitCode = await runCliCommand(
      { kind: 'exec', sessionName: 'dev-shell', command: 'sbatch deploy.sh', options: { auto: false } },
      deps,
    );

    expect(exitCode).toBe(0);
    expect(deps.__stdout).toContain('Submitted batch job 42');
    expect(deps.__stdout).toContain('Use squeue to monitor the job.');
    expect(deps.__stdout).toContain('Save the printed job id.');
  });

  it('fails clearly when exec reminder config is invalid', async () => {
    const deps = createDeps({
      loadUserConfig: vi.fn(async () => ({
        exec: {
          reminders: [{ when: 'both', pattern: '(', reminder: 'broken' }],
        },
      })),
    });

    await expect(
      runCliCommand({ kind: 'exec', sessionName: 'dev-shell', command: 'pwd', options: { auto: false } }, deps),
    ).rejects.toThrow(/Invalid exec reminder regex/);
    expect(deps.sessionService.execute).not.toHaveBeenCalled();
  });

  it('lists sessions and hosts', async () => {
    const deps = createDeps({
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 22, username: 'alice' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn((id: string) => ({
          id,
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: 'pwd',
          disposed: false,
        })),
        listSessions: vi.fn(() => [
          {
            id: 'dev-shell',
            host: 'example.com',
            port: 22,
            username: 'alice',
            createdAt: 1,
            lastCommand: 'pwd',
            disposed: false,
            status: 'active',
            logPath: '/tmp/dev-shell.log',
          },
        ]),
        listDeadSessions: vi.fn(() => [
          {
            id: 'dead-shell',
            host: 'example.com',
            port: 22,
            username: 'alice',
            createdAt: 1,
            lastCommand: 'ls',
            reason: 'SSH connection ended unexpectedly',
            logPath: '/tmp/dead-shell.log',
            detectedAt: 2,
          },
        ]),
        consumeNotifications: vi.fn(() => ['[session-dead] Session \'dead-shell\' is dead: SSH connection ended unexpectedly. Log: /tmp/dead-shell.log']),
      },
    });

    const exitCode = await runCliCommand({ kind: 'list' }, deps);

    expect(exitCode).toBe(0);
    expect(deps.__stdout).toContain('Sessions:');
    expect(deps.__stdout).toContain('Dead sessions:');
    expect(deps.__stdout).toContain('Hosts:');
    expect(deps.__stdout).toContain('dev-shell');
    expect(deps.__stdout).toContain('/tmp/dev-shell.log');
    expect(deps.__stdout).toContain('dead-shell');
    expect(deps.__stdout).toContain('/tmp/dead-shell.log');
    expect(deps.__stdout).toContain('dev');
    expect(deps.__stderr).toContain('[session-dead]');
  });

  it('closes sessions, reads logs, and emits attach instructions', async () => {
    const deps = createDeps();

    await expect(runCliCommand({ kind: 'kill', sessionName: 'dev-shell' }, deps)).resolves.toBe(0);
    await expect(
      runCliCommand({ kind: 'logs', sessionName: 'dev-shell', options: { lines: 10, follow: false } }, deps),
    ).resolves.toBe(0);
    await expect(runCliCommand({ kind: 'attach', sessionName: 'dev-shell' }, deps)).resolves.toBe(0);

    expect(deps.sessionService.closeSession).toHaveBeenCalledWith('dev-shell');
    expect(deps.readLogs).toHaveBeenCalledWith('dev-shell', { lines: 10, follow: false });
    expect(deps.attachSession).toHaveBeenCalledWith('dev-shell');
  });

  it('dispatches put and get transfer handlers', async () => {
    const deps = createDeps();

    await expect(
      runCliCommand(
        {
          kind: 'put',
          options: { host: 'dev', sourcePath: './local.txt', destinationPath: '/tmp/remote.txt', recursive: false },
        },
        deps,
      ),
    ).resolves.toBe(0);
    await expect(
      runCliCommand(
        {
          kind: 'get',
          options: { host: 'dev', sourcePath: '/tmp/remote.txt', destinationPath: './local.txt', recursive: false },
        },
        deps,
      ),
    ).resolves.toBe(0);

    expect(deps.putPath).toHaveBeenCalledWith({
      host: 'dev',
      sourcePath: './local.txt',
      destinationPath: '/tmp/remote.txt',
      recursive: false,
    });
    expect(deps.getPath).toHaveBeenCalledWith({
      host: 'dev',
      sourcePath: '/tmp/remote.txt',
      destinationPath: './local.txt',
      recursive: false,
    });
    expect(deps.__stdout).toContain("Uploaded '/tmp/file.txt' to 'dev:/remote/file.txt'");
    expect(deps.__stdout).toContain("Downloaded 'dev:/remote/file.txt' to '/tmp/file.txt'");
  });

  it('prints the local tmux fallback message when no attach handler is available', async () => {
    const deps = createDeps({ attachSession: undefined });

    const exitCode = await runCliCommand({ kind: 'attach', sessionName: 'dev-shell' }, deps);

    expect(exitCode).toBe(0);
    expect(deps.__stdout).toContain('Local attach requires tmux. Run:');
    expect(deps.__stdout).toContain('tmux new-session -A -s ssh-cli-dev-shell ssh -t alice@example.com');
    expect(deps.__stdout).toContain('remote host does not need tmux');
  });

  it('fails on duplicate host ids before saving', async () => {
    const deps = createDeps({
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 22, username: 'alice' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
    });

    await expect(
      runCliCommand(
        {
          kind: 'add-host',
          name: 'dev',
          username: 'alice',
          options: { host: 'example.com', port: 22 },
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('attach helpers', () => {
  it('creates a local-only tmux fallback message', () => {
    expect(
      createAttachFallbackMessage('dev-shell', {
        id: 'dev-shell',
        host: 'example.com',
        port: 22,
        username: 'alice',
        createdAt: 1,
        lastCommand: null,
        disposed: false,
      }),
    ).toContain('tmux new-session -A -s ssh-cli-dev-shell ssh -t alice@example.com');
  });

  it('includes the stored key path in attach commands for matching hosts', async () => {
    const runCommand = vi.fn(async () => 0);
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 2200, username: 'alice', keyPath: '~/.ssh/id_ed25519' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 2200, username: 'alice', keyPath: '~/.ssh/id_ed25519' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 2200, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 2200,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await attachSession('dev-shell');

    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['new-session', '-Ad', '-s', 'ssh-cli-dev-shell', 'ssh', '-i', '~/.ssh/id_ed25519', '-p', '2200', '-t', 'alice@example.com'],
      { stdio: 'inherit' },
    );
  });

  it('uses sshpass for password-auth attach when a matching host stores a password', async () => {
    const runCommand = vi.fn(async () => 0);
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await attachSession('dev-shell');

    expect(runCommand).toHaveBeenNthCalledWith(1, 'sshpass', ['-V'], { stdio: 'ignore' });
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      'tmux',
      ['new-session', '-Ad', '-s', 'ssh-cli-dev-shell', 'sshpass', '-e', 'ssh', '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no', '-t', 'alice@example.com'],
      { stdio: 'inherit', env: { SSHPASS: 'secret' } },
    );
  });

  it('fails clearly when password-auth attach needs sshpass but it is missing', async () => {
    const runCommand = vi.fn(async () => {
      const error = new Error('missing');
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    });
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await expect(attachSession('dev-shell')).rejects.toEqual(
      new CLIError(
        "Password-based attach for host 'dev' requires local 'sshpass'. Install sshpass and rerun, or re-save the host with --key-path / agent auth.",
      ),
    );
  });

  it('reports missing local tmux even for password-auth hosts', async () => {
    const runCommand = vi
      .fn(async () => 0)
      .mockImplementationOnce(async () => 0)
      .mockImplementationOnce(async () => {
        const error = new Error('missing tmux');
        (error as NodeJS.ErrnoException).code = 'ENOENT';
        throw error;
      });
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await expect(attachSession('dev-shell')).rejects.toEqual(
      new CLIError(
        "Local tmux is required for 'ssh-cli attach'. Install tmux on this machine and rerun; the remote host does not need tmux. Stored host id: dev.",
      ),
    );
  });

  it('starts and attaches a local tmux session without remote tmux commands', async () => {
    const runCommand = vi.fn(async () => 0);
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => [{ id: 'dev', host: 'example.com', port: 2200, username: 'alice' }]),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 2200, username: 'alice' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 2200, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 2200,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await attachSession('dev-shell');

    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['new-session', '-Ad', '-s', 'ssh-cli-dev-shell', 'ssh', '-p', '2200', '-t', 'alice@example.com'],
      { stdio: 'inherit' },
    );
    expect(runCommand).toHaveBeenNthCalledWith(2, 'tmux', ['attach-session', '-t', 'ssh-cli-dev-shell'], { stdio: 'inherit' });
  });

  it('switches the local tmux client when already inside tmux', async () => {
    const runCommand = vi.fn(async () => 0);
    const attachSession = createAttachSession({
      env: { TMUX: '/tmp/tmux-1000/default,123,0' },
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => []),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'dev-shell',
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await attachSession('dev-shell');

    expect(runCommand).toHaveBeenNthCalledWith(2, 'tmux', ['switch-client', '-t', 'ssh-cli-dev-shell'], { stdio: 'inherit' });
  });

  it('normalizes the local tmux session name for spaced session ids', async () => {
    const runCommand = vi.fn(async () => 0);
    const attachSession = createAttachSession({
      env: {},
      runCommand,
      hostStore: {
        listHosts: vi.fn(async () => []),
        saveHosts: vi.fn(async () => undefined),
        getHost: vi.fn(async () => ({ id: 'dev', host: 'example.com', port: 22, username: 'alice' })),
        getConnectConfig: vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' })),
      },
      sessionService: {
        startSession: vi.fn(),
        execute: vi.fn(),
        closeSession: vi.fn(),
        getSessionInfo: vi.fn(async () => ({
          id: 'deploy shell/blue',
          host: 'example.com',
          port: 22,
          username: 'alice',
          createdAt: 1,
          lastCommand: null,
          disposed: false,
        })),
        listSessions: vi.fn(async () => []),
        listDeadSessions: vi.fn(async () => []),
        consumeNotifications: vi.fn(async () => []),
      },
    });

    await attachSession('deploy shell/blue');

    expect(runCommand).toHaveBeenNthCalledWith(
      1,
      'tmux',
      ['new-session', '-Ad', '-s', 'ssh-cli-deploy-shell-blue', 'ssh', '-t', 'alice@example.com'],
      { stdio: 'inherit' },
    );
    expect(createAttachFallbackMessage('deploy shell/blue', {
      id: 'deploy shell/blue',
      host: 'example.com',
      port: 22,
      username: 'alice',
      createdAt: 1,
      lastCommand: null,
      disposed: false,
    })).toContain('tmux new-session -A -s ssh-cli-deploy-shell-blue ssh -t alice@example.com');
  });
});
