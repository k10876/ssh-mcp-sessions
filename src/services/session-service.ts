import { appendFile, chmod, mkdir } from 'node:fs/promises';
import os from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ClientChannel, ConnectConfig } from 'ssh2';
import SSH2Module from 'ssh2';

import { getMaxInactivityMs } from '../config.js';
import { SessionError, SessionExistsError, SessionNotFoundError } from '../errors.js';
import type { DeadSessionInfo } from '../types/dead-session.js';
import type { ActiveSessionInfo, CommandResult, SessionInfo } from '../types/session.js';

const { Client: SSHClient } = SSH2Module as typeof import('ssh2');

const DEFAULT_LOGS_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions', 'logs');

type SessionFactory = (args: {
  id: string;
  config: ConnectConfig;
  timeoutMs: number;
  logPath: string;
  onDisposed: (id: string) => void;
  onUnexpectedDeath: (info: SessionInfo, reason: string) => void;
}) => SessionHandle;

interface SessionHandle {
  getInfo(): SessionInfo;
  ensureConnected(): Promise<void>;
  execute(command: string): Promise<CommandResult>;
  dispose(): void;
}

export type SessionServiceOptions = {
  logsDir?: string;
  sessionFactory?: SessionFactory;
};

class PersistentSession implements SessionHandle {
  private conn: InstanceType<typeof SSHClient> | null = null;
  private shell: ClientChannel | null = null;
  private buffer = '';
  private commandQueue: Promise<void> = Promise.resolve();
  private pendingCommand: {
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    marker: string;
  } | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private disposed = false;
  private terminated = false;
  private terminalError: Error | null = null;
  private readonly createdAt = Date.now();
  private lastCommand: string | null = null;

  constructor(
    private readonly id: string,
    private readonly config: ConnectConfig,
    private readonly timeoutMs: number,
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
    if (this.disposed) {
      throw new SessionError(`Session '${this.id}' has been disposed`);
    }
    if (this.terminated) {
      throw this.terminalError ?? new SessionError(`Session '${this.id}' is no longer available`);
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
          stream.stderr?.on('data', (data: string) => {
            this.buffer += data;
            this.processPending();
          });
          stream.on('close', () => {
            this.cleanup(new Error('SSH shell closed unexpectedly'));
          });

          stream.write('export PS1=""\n');
          stream.write('stty -echo 2>/dev/null\n');
          resolve();
        });
      });

      conn.once('error', (error) => handleError(error));
      conn.once('end', () => this.cleanup(new Error('SSH connection ended unexpectedly')));
      conn.once('close', () => this.cleanup(new Error('SSH connection closed unexpectedly')));
      conn.connect(this.config);
    });

    this.resetInactivityTimer();
  }

  async execute(command: string): Promise<CommandResult> {
    const execution = this.commandQueue.then(async () => {
      await this.ensureConnected();

      if (!this.shell) {
        throw new SessionError('SSH shell not ready');
      }

      this.lastCommand = command;
      this.resetInactivityTimer();

      const token = randomUUID();
      const marker = `__MCP_DONE__${token}__`;

      return new Promise<CommandResult>((resolve, reject) => {
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
    });

    this.commandQueue = execution.then(
      () => undefined,
      () => undefined,
    );

    return execution;
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
      this.cleanup(new Error(`Session timed out after ${this.timeoutMs}ms of inactivity`));
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
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.terminalError = error ?? new Error('SSH session closed');

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
      this.onDisposed(this.id);
      return;
    }

    const reason = error?.message ?? 'SSH session closed unexpectedly';
    this.onUnexpectedDeath(this.getInfo(), reason);
  }
}

export class SessionService {
  private readonly activeSessions = new Map<string, SessionHandle>();
  private readonly deadSessions = new Map<string, DeadSessionInfo>();
  private readonly notifications: string[] = [];
  private readonly logsDir: string;
  private readonly sessionFactory: SessionFactory;

  constructor(
    private readonly timeoutMs = getMaxInactivityMs(),
    options: SessionServiceOptions = {},
  ) {
    this.logsDir = options.logsDir ?? DEFAULT_LOGS_DIR;
    this.sessionFactory =
      options.sessionFactory ??
      ((args) =>
        new PersistentSession(args.id, args.config, args.timeoutMs, args.onDisposed, args.onUnexpectedDeath));
  }

  async startSession(id: string, config: ConnectConfig): Promise<SessionInfo> {
    const session = await this.getOrCreateSession(id, config, true);
    return session.getInfo();
  }

  async ensureSession(id: string, config: ConnectConfig): Promise<SessionInfo> {
    const session = await this.getOrCreateSession(id, config, false);
    return session.getInfo();
  }

  async execute(id: string, command: string): Promise<CommandResult> {
    const session = this.activeSessions.get(id);
    if (!session) {
      const dead = this.deadSessions.get(id);
      if (dead) {
        const message = this.buildDeadSessionMessage(dead);
        this.pushNotification(`[session-dead] ${message}`);
        throw new SessionError(message);
      }
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }

    await this.logEvent(id, `EXEC ${command}`);
    try {
      const result = await session.execute(command);
      const summary = `RESULT exit=${result.exitCode} bytes=${Buffer.byteLength(result.output, 'utf8')}`;
      await this.logEvent(id, summary);
      if (result.output) {
        await this.logEvent(id, `OUTPUT\n${result.output}`);
      }
      return result;
    } catch (error) {
      await this.logEvent(id, `ERROR ${(error as Error).message}`);
      throw error;
    }
  }

  async closeSession(id: string): Promise<void> {
    const session = this.activeSessions.get(id);
    if (!session) {
      const dead = this.deadSessions.get(id);
      if (dead) {
        this.deadSessions.delete(id);
        await this.logEvent(id, `CLOSE acknowledged dead session: ${dead.reason}`);
        return;
      }
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }

    await this.logEvent(id, 'CLOSE requested');
    session.dispose();
    this.activeSessions.delete(id);
    await this.logEvent(id, 'CLOSE completed');
  }

  listSessions(): ActiveSessionInfo[] {
    return Array.from(this.activeSessions.entries(), ([id, session]) => ({
      ...session.getInfo(),
      status: 'active' as const,
      logPath: this.getLogPath(id),
    }));
  }

  listDeadSessions(): DeadSessionInfo[] {
    return Array.from(this.deadSessions.values()).sort((left, right) => right.detectedAt - left.detectedAt);
  }

  consumeNotifications(): string[] {
    return this.notifications.splice(0, this.notifications.length);
  }

  getSessionInfo(id: string): SessionInfo {
    const session = this.activeSessions.get(id);
    if (!session) {
      const dead = this.deadSessions.get(id);
      if (dead) {
        throw new SessionError(this.buildDeadSessionMessage(dead));
      }
      throw new SessionNotFoundError(`Session '${id}' does not exist`);
    }
    return session.getInfo();
  }

  hasSession(id: string): boolean {
    return this.activeSessions.has(id);
  }

  async markSessionDead(id: string, reason: string): Promise<void> {
    const session = this.activeSessions.get(id);
    if (!session) {
      return;
    }

    this.activeSessions.delete(id);
    const info = session.getInfo();
    const deadInfo = this.buildDeadSessionInfo(info, reason);
    this.deadSessions.set(id, deadInfo);
    this.pushNotification(`[session-dead] ${this.buildDeadSessionMessage(deadInfo)}`);
    await this.logEvent(id, `DEAD ${reason}`);
  }

  private async getOrCreateSession(id: string, config: ConnectConfig, failIfExists: boolean): Promise<SessionHandle> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      throw new SessionError('Session name is required');
    }

    const existing = this.activeSessions.get(trimmedId);
    if (existing) {
      if (failIfExists) {
        throw new SessionExistsError(`Session '${trimmedId}' already exists`);
      }
      return existing;
    }

    this.deadSessions.delete(trimmedId);

    const session = this.sessionFactory({
      id: trimmedId,
      config,
      timeoutMs: this.timeoutMs,
      logPath: this.getLogPath(trimmedId),
      onDisposed: (disposedId) => {
        this.activeSessions.delete(disposedId);
      },
      onUnexpectedDeath: (info, reason) => {
        void this.handleUnexpectedDeath(info, reason);
      },
    });

    this.activeSessions.set(trimmedId, session);
    await this.logEvent(trimmedId, `START ${config.username ?? 'unknown'}@${config.host ?? 'unknown'}:${config.port ?? 22}`);

    try {
      await session.ensureConnected();
      await this.logEvent(trimmedId, 'READY shell connected');
      return session;
    } catch (error) {
      await this.handleUnexpectedDeath(session.getInfo(), (error as Error).message);
      throw error;
    }
  }

  private async handleUnexpectedDeath(info: SessionInfo, reason: string): Promise<void> {
    const current = this.activeSessions.get(info.id);
    if (!current) {
      return;
    }

    this.activeSessions.delete(info.id);
    const deadInfo = this.buildDeadSessionInfo(info, reason);
    this.deadSessions.set(info.id, deadInfo);
    this.pushNotification(`[session-dead] ${this.buildDeadSessionMessage(deadInfo)}`);
    await this.logEvent(info.id, `DEAD ${reason}`);
  }

  private buildDeadSessionInfo(info: SessionInfo, reason: string): DeadSessionInfo {
    return {
      id: info.id,
      host: info.host,
      port: info.port,
      username: info.username,
      createdAt: info.createdAt,
      lastCommand: info.lastCommand,
      reason,
      logPath: this.getLogPath(info.id),
      detectedAt: Date.now(),
    };
  }

  private buildDeadSessionMessage(dead: DeadSessionInfo): string {
    return `Session '${dead.id}' is dead: ${dead.reason}. Log: ${dead.logPath}`;
  }

  private pushNotification(message: string): void {
    if (this.notifications.at(-1) === message) {
      return;
    }

    this.notifications.push(message);
  }

  private getLogPath(id: string): string {
    return resolvePath(this.logsDir, `${id}.log`);
  }

  private async ensureLogsDir(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true, mode: 0o700 });
    await chmod(this.logsDir, 0o700).catch(() => undefined);
  }

  private async logEvent(id: string, message: string): Promise<void> {
    await this.ensureLogsDir();
    const timestamp = new Date().toISOString();
    await appendFile(this.getLogPath(id), `[${timestamp}] ${message}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

export const defaultSessionService = new SessionService();
