import { access, chmod, mkdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve as resolvePath } from 'node:path';
import { createServer, createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import type { ConnectConfig } from 'ssh2';

import type { DeadSessionInfo } from '../types/dead-session.js';
import type { ActiveSessionInfo, CommandResult, SessionInfo } from '../types/session.js';

const DEFAULT_RUNTIME_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions', 'run');
const DEFAULT_SOCKET_PATH = resolvePath(DEFAULT_RUNTIME_DIR, 'daemon.sock');
const DAEMON_START_TIMEOUT_MS = 3_000;
const DAEMON_POLL_INTERVAL_MS = 50;

type ConnectConfigPayload = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  privateKey?: string;
  agent?: string;
  agentForward?: boolean;
};

type SessionDaemonService = {
  startSession(id: string, config: ConnectConfig): Promise<SessionInfo>;
  execute(id: string, command: string): Promise<CommandResult>;
  closeSession(id: string): Promise<void>;
  getSessionInfo(id: string): SessionInfo;
  listSessions(): ActiveSessionInfo[];
  listDeadSessions(): DeadSessionInfo[];
  consumeNotifications(): string[];
};

type DaemonRequest = {
  id: string;
  method:
    | 'ping'
    | 'startSession'
    | 'execute'
    | 'closeSession'
    | 'getSessionInfo'
    | 'listSessions'
    | 'listDeadSessions'
    | 'consumeNotifications';
  params?: Record<string, unknown>;
};

type DaemonResponse =
  | {
      id: string;
      ok: true;
      result: unknown;
    }
  | {
      id: string;
      ok: false;
      error: {
        name: string;
        message: string;
      };
    };

export type DaemonSessionRepository = {
  startSession(id: string, config: ConnectConfig): Promise<SessionInfo>;
  execute(id: string, command: string): Promise<CommandResult>;
  closeSession(id: string): Promise<void>;
  getSessionInfo(id: string): Promise<SessionInfo>;
  listSessions(): Promise<ActiveSessionInfo[]>;
  listDeadSessions(): Promise<DeadSessionInfo[]>;
  consumeNotifications(): Promise<string[]>;
};

export type SessionDaemonHandle = {
  close(): Promise<void>;
};

export function getDefaultDaemonSocketPath(): string {
  return DEFAULT_SOCKET_PATH;
}

export function createDaemonSessionRepository(options: {
  socketPath?: string;
  ensureDaemonStarted?: () => Promise<void>;
} = {}): DaemonSessionRepository {
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH;
  const ensureDaemonStarted = options.ensureDaemonStarted ?? (() => ensureDaemon(socketPath));

  async function send<T>(method: DaemonRequest['method'], params?: Record<string, unknown>): Promise<T> {
    await ensureDaemonStarted();
    return sendDaemonRequest<T>(socketPath, method, params);
  }

  return {
    startSession(id, config) {
      return send<SessionInfo>('startSession', { id, config: serializeConnectConfig(config) });
    },
    execute(id, command) {
      return send<CommandResult>('execute', { id, command });
    },
    closeSession(id) {
      return send<void>('closeSession', { id });
    },
    getSessionInfo(id) {
      return send<SessionInfo>('getSessionInfo', { id });
    },
    listSessions() {
      return send<ActiveSessionInfo[]>('listSessions');
    },
    listDeadSessions() {
      return send<DeadSessionInfo[]>('listDeadSessions');
    },
    consumeNotifications() {
      return send<string[]>('consumeNotifications');
    },
  };
}

export async function startSessionDaemon(options: {
  socketPath?: string;
  sessionService: SessionDaemonService;
}): Promise<SessionDaemonHandle> {
  const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH;
  await ensureRuntimeDir(dirname(socketPath));

  if (await isDaemonResponsive(socketPath)) {
    return { close: async () => undefined };
  }

  await removeStaleSocket(socketPath);

  const server = createServer((socket) => {
    let buffer = '';

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      buffer += chunk;
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = '';

      void handleDaemonRequest(options.sessionService, line)
        .then((response) => {
          socket.end(`${JSON.stringify(response)}\n`);
        })
        .catch((error) => {
          const response: DaemonResponse = {
            id: 'unknown',
            ok: false,
            error: {
              name: error instanceof Error ? error.name : 'Error',
              message: error instanceof Error ? error.message : String(error),
            },
          };
          socket.end(`${JSON.stringify(response)}\n`);
        });
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(socketPath);
  });

  await chmod(socketPath, 0o600).catch(() => undefined);

  return {
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await unlink(socketPath).catch(() => undefined);
    },
  };
}

export async function ensureDaemon(socketPath = DEFAULT_SOCKET_PATH): Promise<void> {
  if (await isDaemonResponsive(socketPath)) {
    return;
  }

  await ensureRuntimeDir(dirname(socketPath));
  await removeStaleSocket(socketPath);
  spawnDaemonProcess();
  await waitForDaemon(socketPath);
}

async function handleDaemonRequest(sessionService: SessionDaemonService, rawRequest: string): Promise<DaemonResponse> {
  const request = JSON.parse(rawRequest) as DaemonRequest;

  try {
    switch (request.method) {
      case 'ping':
        return { id: request.id, ok: true, result: { status: 'ok' } };
      case 'startSession': {
        const params = request.params as { id: string; config: ConnectConfigPayload };
        return {
          id: request.id,
          ok: true,
          result: await sessionService.startSession(params.id, deserializeConnectConfig(params.config)),
        };
      }
      case 'execute': {
        const params = request.params as { id: string; command: string };
        return {
          id: request.id,
          ok: true,
          result: await sessionService.execute(params.id, params.command),
        };
      }
      case 'closeSession': {
        const params = request.params as { id: string };
        await sessionService.closeSession(params.id);
        return { id: request.id, ok: true, result: null };
      }
      case 'getSessionInfo': {
        const params = request.params as { id: string };
        return { id: request.id, ok: true, result: sessionService.getSessionInfo(params.id) };
      }
      case 'listSessions':
        return { id: request.id, ok: true, result: sessionService.listSessions() };
      case 'listDeadSessions':
        return { id: request.id, ok: true, result: sessionService.listDeadSessions() };
      case 'consumeNotifications':
        return { id: request.id, ok: true, result: sessionService.consumeNotifications() };
    }
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function serializeConnectConfig(config: ConnectConfig): ConnectConfigPayload {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: typeof config.password === 'string' ? config.password : undefined,
    privateKey:
      typeof config.privateKey === 'string'
        ? config.privateKey
        : Buffer.isBuffer(config.privateKey)
          ? config.privateKey.toString('utf8')
          : undefined,
    agent: typeof config.agent === 'string' ? config.agent : undefined,
    agentForward: config.agentForward,
  };
}

function deserializeConnectConfig(config: ConnectConfigPayload): ConnectConfig {
  return {
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    privateKey: config.privateKey,
    agent: config.agent,
    agentForward: config.agentForward,
  };
}

async function sendDaemonRequest<T>(socketPath: string, method: DaemonRequest['method'], params?: Record<string, unknown>): Promise<T> {
  const request: DaemonRequest = {
    id: randomUUID(),
    method,
    ...(params ? { params } : {}),
  };

  const raw = await new Promise<string>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = '';

    socket.setEncoding('utf8');
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      response += chunk;
      if (response.includes('\n')) {
        socket.end();
        resolve(response.trim());
      }
    });
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });

  const parsed = JSON.parse(raw) as DaemonResponse;
  if (!parsed.ok) {
    const error = new Error(parsed.error.message);
    error.name = parsed.error.name;
    throw error;
  }

  return parsed.result as T;
}

async function isDaemonResponsive(socketPath: string): Promise<boolean> {
  try {
    await access(socketPath);
  } catch {
    return false;
  }

  try {
    await sendDaemonRequest(socketPath, 'ping');
    return true;
  } catch {
    return false;
  }
}

async function removeStaleSocket(socketPath: string): Promise<void> {
  if (await isDaemonResponsive(socketPath)) {
    return;
  }

  await unlink(socketPath).catch(() => undefined);
}

async function ensureRuntimeDir(runtimeDir: string): Promise<void> {
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  await chmod(runtimeDir, 0o700).catch(() => undefined);
}

function spawnDaemonProcess(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const entrypoint = resolvePath(currentDir, '..', 'index.js');
  const child = spawn(process.execPath, [entrypoint, 'daemon'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

async function waitForDaemon(socketPath: string): Promise<void> {
  const deadline = Date.now() + DAEMON_START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isDaemonResponsive(socketPath)) {
      return;
    }
    await sleep(DAEMON_POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for ssh-cli session daemon to start');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
