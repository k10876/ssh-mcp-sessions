import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import type { ConnectConfig } from 'ssh2';

import { SessionNotFoundError } from '../src/errors.js';
import { SessionService } from '../src/services/session-service.js';
import type { CommandResult, SessionInfo } from '../src/types/session.js';

class FakeSession {
  private disposed = false;
  private lastCommand: string | null = null;
  private readonly createdAt = 1;

  constructor(
    private readonly id: string,
    private readonly config: ConnectConfig,
    private readonly onDisposed: (id: string) => void,
    private readonly onUnexpectedDeath: (info: SessionInfo, reason: string) => void,
  ) {}

  getInfo(): SessionInfo {
    return {
      id: this.id,
      host: this.config.host ?? 'unknown',
      port: this.config.port ?? 22,
      username: this.config.username ?? 'unknown',
      createdAt: this.createdAt,
      lastCommand: this.lastCommand,
      disposed: this.disposed,
    };
  }

  async ensureConnected(): Promise<void> {
    return undefined;
  }

  async execute(command: string): Promise<CommandResult> {
    this.lastCommand = command;
    return { output: `ran:${command}`, exitCode: 0 };
  }

  dispose(): void {
    this.disposed = true;
    this.onDisposed(this.id);
  }

  kill(reason: string): void {
    this.onUnexpectedDeath(this.getInfo(), reason);
  }
}

describe('session observability', () => {
  let tempDir = '';
  let fakeSessions = new Map<string, FakeSession>();

  afterEach(async () => {
    fakeSessions = new Map<string, FakeSession>();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  function createService() {
    return new SessionService(1234, {
      logsDir: tempDir,
      sessionFactory: ({ id, config, onDisposed, onUnexpectedDeath }) => {
        const session = new FakeSession(id, config, onDisposed, onUnexpectedDeath);
        fakeSessions.set(id, session);
        return session;
      },
    });
  }

  const config: ConnectConfig = {
    host: 'example.com',
    port: 22,
    username: 'alice',
  };

  it('creates timestamped session logs for start, exec, result, and close', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-session-logs-'));
    const service = createService();

    await service.startSession('dev-shell', config);
    await service.execute('dev-shell', 'pwd');
    await service.closeSession('dev-shell');

    const logPath = join(tempDir, 'dev-shell.log');
    const raw = await readFile(logPath, 'utf8');
    expect(raw).toMatch(/^\[[^\]]+\] START /m);
    expect(raw).toContain('READY shell connected');
    expect(raw).toContain('EXEC pwd');
    expect(raw).toContain('RESULT exit=0');
    expect(raw).toContain('OUTPUT\nran:pwd');
    expect(raw).toContain('CLOSE requested');
    expect(raw).toContain('CLOSE completed');
  });

  it('tracks dead sessions and surfaces notifications with log paths', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-dead-session-'));
    const service = createService();

    await service.startSession('dev-shell', config);
    fakeSessions.get('dev-shell')?.kill('SSH connection ended unexpectedly');

    const deadSessions = service.listDeadSessions();
    expect(deadSessions).toHaveLength(1);
    expect(deadSessions[0]).toMatchObject({
      id: 'dev-shell',
      reason: 'SSH connection ended unexpectedly',
      logPath: join(tempDir, 'dev-shell.log'),
    });

    expect(service.consumeNotifications()).toEqual([
      `[session-dead] Session 'dev-shell' is dead: SSH connection ended unexpectedly. Log: ${join(tempDir, 'dev-shell.log')}`,
    ]);
  });

  it('reports dead session reason and log path on exec', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-dead-exec-'));
    const service = createService();

    await service.startSession('dev-shell', config);
    fakeSessions.get('dev-shell')?.kill('remote host closed the session');

    await expect(service.execute('dev-shell', 'pwd')).rejects.toThrow(
      `Session 'dev-shell' is dead: remote host closed the session. Log: ${join(tempDir, 'dev-shell.log')}`,
    );
    expect(service.consumeNotifications()).toEqual([
      `[session-dead] Session 'dev-shell' is dead: remote host closed the session. Log: ${join(tempDir, 'dev-shell.log')}`,
    ]);
  });

  it('lists active sessions with status and log paths', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-active-session-'));
    const service = createService();

    await service.startSession('dev-shell', config);

    expect(service.listSessions()).toEqual([
      {
        id: 'dev-shell',
        host: 'example.com',
        port: 22,
        username: 'alice',
        createdAt: 1,
        lastCommand: null,
        disposed: false,
        status: 'active',
        logPath: join(tempDir, 'dev-shell.log'),
      },
    ]);
  });

  it('still throws not found for missing sessions with no death record', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-missing-session-'));
    const service = createService();

    await expect(service.execute('missing', 'pwd')).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(() => service.getSessionInfo('missing')).toThrow("Session 'missing' does not exist");
  });

  it('getSessionInfo reports dead sessions clearly', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-dead-info-'));
    const service = createService();

    await service.startSession('dev-shell', config);
    fakeSessions.get('dev-shell')?.kill('session timeout');

    expect(() => service.getSessionInfo('dev-shell')).toThrow(
      `Session 'dev-shell' is dead: session timeout. Log: ${join(tempDir, 'dev-shell.log')}`,
    );
  });
});
