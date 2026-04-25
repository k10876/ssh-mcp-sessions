import { randomUUID } from 'node:crypto';

import type { ClientChannel, ConnectConfig } from 'ssh2';
import SSH2Module from 'ssh2';

import { getMaxInactivityMs } from '../config.js';
import { SessionBusyError, SessionError, SessionExistsError, SessionNotFoundError } from '../errors.js';
import type { CommandResult, SessionInfo } from '../types/session.js';

const { Client: SSHClient } = SSH2Module as typeof import('ssh2');

class PersistentSession {
  private conn: InstanceType<typeof SSHClient> | null = null;
  private shell: ClientChannel | null = null;
  private buffer = '';
  private pendingCommand: {
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    marker: string;
  } | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private readonly createdAt = Date.now();
  private lastCommand: string | null = null;

  constructor(
    private readonly id: string,
    private readonly config: ConnectConfig,
    private readonly timeoutMs: number,
    private readonly onDispose?: (id: string) => void,
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
    if (this.disposed) {
      throw new SessionError(`Session ${this.id} has been disposed`);
    }
    if (this.conn && this.shell) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const conn = new SSHClient();
      this.conn = conn;

      const handleError = (error: Error) => {
        this.cleanup(error);
        reject(error);
      };

      conn.once('ready', () => {
        conn.shell({ term: 'xterm', rows: 40, cols: 120 }, (error, stream) => {
          if (error) {
            handleError(error);
            return;
          }

          this.shell = stream;
          stream.setEncoding('utf8');
          stream.on('data', (data: string) => {
            this.buffer += data;
            this.processPending();
          });
          stream.on('close', () => {
            this.cleanup();
          });
          stream.stderr?.on('data', (data: string) => {
            this.buffer += data;
            this.processPending();
          });

          stream.write('export PS1=""\n');
          stream.write('stty -echo 2>/dev/null\n');
          resolve();
        });
      });

      conn.once('error', handleError);
      conn.once('end', () => this.cleanup());
      conn.connect(this.config);
    });

    this.resetInactivityTimer();
  }

  async execute(command: string): Promise<CommandResult> {
    await this.ensureConnected();

    if (!this.shell) {
      throw new SessionError('SSH shell not ready');
    }
    if (this.pendingCommand) {
      throw new SessionBusyError('Another command is still running in this session');
    }

    this.lastCommand = command;
    this.resetInactivityTimer();

    const token = randomUUID();
    const marker = `__SSH_CLI_DONE__${token}__`;

    return new Promise((resolve, reject) => {
      this.pendingCommand = {
        marker,
        resolve,
        reject,
      };

      const commandWithNewline = command.endsWith('\n') ? command : `${command}\n`;
      this.shell!.write(commandWithNewline, (error) => {
        if (error) {
          this.rejectPending(error);
          return;
        }
        this.shell!.write(`printf '${marker}%d\\n' $?\n`, (printfError) => {
          if (printfError) {
            this.rejectPending(printfError);
          }
        });
      });
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cleanup();
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      this.dispose();
    }, this.timeoutMs);
  }

  private processPending(): void {
    if (!this.pendingCommand) {
      return;
    }

    const { marker, resolve } = this.pendingCommand;
    const markerIndex = this.buffer.indexOf(marker);
    if (markerIndex === -1) {
      return;
    }

    const afterMarker = this.buffer.slice(markerIndex + marker.length);
    const newlineIndex = afterMarker.indexOf('\n');
    if (newlineIndex === -1) {
      return;
    }

    const exitCodeText = afterMarker.slice(0, newlineIndex).trim();
    const remaining = afterMarker.slice(newlineIndex + 1);

    const output = this.buffer.slice(0, markerIndex).replace(/\r/g, '');
    const exitCode = Number.parseInt(exitCodeText, 10);

    this.buffer = remaining;
    this.pendingCommand = null;

    const finalOutput = output.replace(/__MCP_READY__\s*/g, '').replace(/\s+$/, '');

    resolve({ output: finalOutput, exitCode: Number.isNaN(exitCode) ? 0 : exitCode });
    this.resetInactivityTimer();
  }

  private rejectPending(error: Error): void {
    if (!this.pendingCommand) {
      return;
    }
    this.pendingCommand.reject(error);
    this.pendingCommand = null;
  }

  private cleanup(error?: Error): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.shell) {
      this.shell.removeAllListeners();
      this.shell.end();
      this.shell = null;
    }

    if (this.conn) {
      this.conn.removeAllListeners();
      this.conn.end();
      this.conn = null;
    }

    if (this.pendingCommand) {
      this.pendingCommand.reject(error ?? new Error('SSH session closed'));
      this.pendingCommand = null;
    }

    this.buffer = '';

    if (this.disposed) {
      this.onDispose?.(this.id);
    }
  }
}

export class SessionService {
  private readonly activeSessions = new Map<string, PersistentSession>();

  constructor(private readonly timeoutMs = getMaxInactivityMs()) {}

  async startSession(id: string, config: ConnectConfig): Promise<SessionInfo> {
    const session = await this.getOrCreateSession(id, config, false, true);
    return session.getInfo();
  }

  async ensureSession(id: string, config: ConnectConfig): Promise<SessionInfo> {
    const session = await this.getOrCreateSession(id, config, false, false);
    return session.getInfo();
  }

  async execute(id: string, command: string): Promise<CommandResult> {
    const session = this.activeSessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }
    return session.execute(command);
  }

  async closeSession(id: string): Promise<void> {
    const session = this.activeSessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }
    session.dispose();
    this.activeSessions.delete(id);
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.activeSessions.values(), (session) => session.getInfo());
  }

  getSessionInfo(id: string): SessionInfo {
    const session = this.activeSessions.get(id);
    if (!session) {
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }
    return session.getInfo();
  }

  hasSession(id: string): boolean {
    return this.activeSessions.has(id);
  }

  private async getOrCreateSession(
    id: string,
    config: ConnectConfig,
    replaceExisting: boolean,
    failIfExists: boolean,
  ): Promise<PersistentSession> {
    if (!id.trim()) {
      throw new SessionError('Session name is required');
    }

    let session = this.activeSessions.get(id);
    if (session && failIfExists) {
      throw new SessionExistsError(`Session '${id}' already exists`);
    }

    if (session && replaceExisting) {
      session.dispose();
      this.activeSessions.delete(id);
      session = undefined;
    }

    if (!session) {
      session = new PersistentSession(id, config, this.timeoutMs, (disposedId) => {
        if (this.activeSessions.get(disposedId) === session) {
          this.activeSessions.delete(disposedId);
        }
      });
      this.activeSessions.set(id, session);
    }

    await session.ensureConnected();
    return session;
  }
}

export const defaultSessionService = new SessionService();
