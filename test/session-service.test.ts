import { describe, expect, it } from 'vitest';
import type { ConnectConfig } from 'ssh2';

import { SessionError, SessionNotFoundError } from '../src/errors.js';
import { SessionService } from '../src/services/session-service.js';
import type { CommandResult, SessionInfo } from '../src/types/session.js';

class FakeQueuedSession {
  private disposed = false;
  private lastCommand: string | null = null;
  private readonly createdAt = 1;
  private readonly env = new Map<string, string>();
  private readonly startedCommands: string[] = [];
  private readonly blockedCommands = new Set<string>();
  private readonly releaseByCommand = new Map<string, () => void>();
  private readonly startResolvers = new Map<string, () => void>();

  constructor(
    private readonly id: string,
    private readonly config: ConnectConfig,
    private readonly onDisposed: (id: string) => void,
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
    this.startedCommands.push(command);
    this.startResolvers.get(command)?.();

    if (this.blockedCommands.has(command)) {
      await new Promise<void>((resolve) => {
        this.releaseByCommand.set(command, resolve);
      });
    }

    const exportMatch = /^export\s+([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(command);
    if (exportMatch) {
      this.env.set(exportMatch[1], exportMatch[2]);
      return { output: '', exitCode: 0 };
    }

    const echoMatch = /^echo\s+\$([A-Za-z_][A-Za-z0-9_]*)$/u.exec(command);
    if (echoMatch) {
      return { output: this.env.get(echoMatch[1]) ?? '', exitCode: 0 };
    }

    return { output: `ran:${command}`, exitCode: 0 };
  }

  dispose(): void {
    this.disposed = true;
    this.onDisposed(this.id);
  }

  waitForStart(command: string): Promise<void> {
    if (this.startedCommands.includes(command)) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.startResolvers.set(command, resolve);
    });
  }

  release(command: string): void {
    this.releaseByCommand.get(command)?.();
  }

  block(command: string): void {
    this.blockedCommands.add(command);
  }

  getStartedCommands(): string[] {
    return [...this.startedCommands];
  }
}

describe('session service', () => {
  const config: ConnectConfig = {
    host: 'example.com',
    port: 22,
    username: 'alice',
  };

  it('requires named sessions before connecting', async () => {
    const service = new SessionService(1000);

    await expect(
      service.startSession('   ', {
        host: 'example.com',
        port: 22,
        username: 'alice',
      }),
    ).rejects.toBeInstanceOf(SessionError);
  });

  it('reports missing sessions for lookup operations', async () => {
    const service = new SessionService(1000);

    expect(() => service.getSessionInfo('missing')).toThrow(SessionNotFoundError);
    await expect(service.execute('missing', 'pwd')).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(service.closeSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('lists no sessions initially', () => {
    const service = new SessionService(1000);

    expect(service.listSessions()).toEqual([]);
    expect(service.hasSession('missing')).toBe(false);
  });

  it('queues overlapping same-session commands in FIFO order', async () => {
    let fakeSession: FakeQueuedSession | undefined;
    const service = new SessionService(1000, {
      sessionFactory: ({ id, config: sessionConfig, onDisposed }) => {
        fakeSession = new FakeQueuedSession(id, sessionConfig, onDisposed);
        return fakeSession;
      },
    });

    await service.startSession('work', config);

    fakeSession!.block('export APP_ENV=dev');
    fakeSession!.block('echo $APP_ENV');

    const first = service.execute('work', 'export APP_ENV=dev');
    await fakeSession!.waitForStart('export APP_ENV=dev');

    const second = service.execute('work', 'echo $APP_ENV');
    await Promise.resolve();

    expect(fakeSession!.getStartedCommands()).toEqual(['export APP_ENV=dev']);

    fakeSession!.release('export APP_ENV=dev');
    await fakeSession!.waitForStart('echo $APP_ENV');

    expect(fakeSession!.getStartedCommands()).toEqual(['export APP_ENV=dev', 'echo $APP_ENV']);

    fakeSession!.release('echo $APP_ENV');

    await expect(first).resolves.toEqual({ output: '', exitCode: 0 });
    await expect(second).resolves.toEqual({ output: 'dev', exitCode: 0 });
  });

  it('serializes exactly simultaneous same-session execute calls', async () => {
    let fakeSession: FakeQueuedSession | undefined;
    const service = new SessionService(1000, {
      sessionFactory: ({ id, config: sessionConfig, onDisposed }) => {
        fakeSession = new FakeQueuedSession(id, sessionConfig, onDisposed);
        return fakeSession;
      },
    });

    await service.startSession('work', config);

    fakeSession!.block('export APP_ENV=queued');
    fakeSession!.block('echo $APP_ENV');

    const first = service.execute('work', 'export APP_ENV=queued');
    const second = service.execute('work', 'echo $APP_ENV');

    await fakeSession!.waitForStart('export APP_ENV=queued');
    await Promise.resolve();
    expect(fakeSession!.getStartedCommands()).toEqual(['export APP_ENV=queued']);

    fakeSession!.release('export APP_ENV=queued');
    await fakeSession!.waitForStart('echo $APP_ENV');
    fakeSession!.release('echo $APP_ENV');

    await expect(Promise.all([first, second])).resolves.toEqual([
      { output: '', exitCode: 0 },
      { output: 'queued', exitCode: 0 },
    ]);
  });
});
