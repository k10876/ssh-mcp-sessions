import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';
import type { ConnectConfig } from 'ssh2';

import { createDaemonSessionRepository, startSessionDaemon } from '../src/cli/daemon.js';
import { SessionService } from '../src/services/session-service.js';
import type { CommandResult, SessionInfo } from '../src/types/session.js';

class FakeSession {
  private disposed = false;
  private lastCommand: string | null = null;
  private readonly createdAt = 1;
  private env = new Map<string, string>();

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
}

describe('cli daemon session repository', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('keeps started sessions available across separate repository calls', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-daemon-'));
    const socketPath = join(tempDir, 'daemon.sock');
    const logsDir = join(tempDir, 'logs');

    const sessionService = new SessionService(1000, {
      logsDir,
      sessionFactory: ({ id, config, onDisposed }) => new FakeSession(id, config, onDisposed),
    });

    const daemon = await startSessionDaemon({ socketPath, sessionService });
    const repoA = createDaemonSessionRepository({
      socketPath,
      ensureDaemonStarted: async () => undefined,
    });
    const repoB = createDaemonSessionRepository({
      socketPath,
      ensureDaemonStarted: async () => undefined,
    });

    try {
      await repoA.startSession('work', { host: 'example.com', port: 22, username: 'alice' });
      await repoB.execute('work', 'export APP_ENV=dev');
      const result = await repoA.execute('work', 'echo $APP_ENV');
      const sessions = await repoB.listSessions();

      expect(result.output).toBe('dev');
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        id: 'work',
        status: 'active',
        host: 'example.com',
        username: 'alice',
      });
    } finally {
      await daemon.close();
    }
  });
});
