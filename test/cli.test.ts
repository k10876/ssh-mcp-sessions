import { describe, expect, it, vi } from 'vitest';

import { ValidationError } from '../src/errors.js';
import { parseCliArgs } from '../src/cli/parse.js';
import { runCliCommand, type CliDependencies } from '../src/cli/run.js';
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
    attachInstructions: vi.fn(async (sessionName: string) => `attach ${sessionName}`),
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

  it('parses list aliases and logs options', () => {
    expect(parseCliArgs(['ps'])).toEqual({ kind: 'list' });
    expect(parseCliArgs(['logs', 'dev-shell', '--lines', '50', '--follow'])).toEqual({
      kind: 'logs',
      sessionName: 'dev-shell',
      options: { lines: 50, follow: true },
    });
  });

  it('rejects invalid host syntax', () => {
    expect(() => parseCliArgs(['add-host', 'dev', '--host', 'example.com'])).toThrow('Host must be in the form user@host');
  });

  it('rejects missing exec commands', () => {
    expect(() => parseCliArgs(['exec', 'dev-shell'])).toThrow('exec requires a session name and command');
  });

  it('rejects blank session names for start', () => {
    expect(() => parseCliArgs(['start', '   ', '--host', 'dev'])).toThrow('start requires a session name');
  });
});

describe('cli dispatch', () => {
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
    expect(deps.attachInstructions).toHaveBeenCalledWith('dev-shell');
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
