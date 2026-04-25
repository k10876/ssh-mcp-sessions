#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { runCliMain } from './cli/index.js';
import {
  HostNotFoundError,
  HostStoreError,
  SessionBusyError,
  SessionError,
  SessionExistsError,
  SessionNotFoundError,
  ValidationError,
} from './errors.js';
import { defaultHostStore } from './services/host-store.js';
import { defaultSessionService } from './services/session-service.js';
import { sanitizeCommand } from './utils/command-utils.js';

export function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof ValidationError) {
    return new McpError(ErrorCode.InvalidParams, error.message);
  }

  if (error instanceof HostNotFoundError || error instanceof SessionNotFoundError) {
    return new McpError(ErrorCode.InvalidParams, error.message);
  }

  if (error instanceof SessionExistsError || error instanceof SessionBusyError) {
    return new McpError(ErrorCode.InvalidRequest, error.message);
  }

  if (error instanceof HostStoreError || error instanceof SessionError) {
    return new McpError(ErrorCode.InternalError, error.message);
  }

  const message = error instanceof Error ? error.message : String(error);
  return new McpError(ErrorCode.InternalError, message);
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ssh-cli-sessions',
    version: '1.0.17',
  });

  server.tool(
    'add-host',
    'Persist a new SSH host configuration.',
    {
      host_id: z.string().describe('Unique identifier for the host. we recommend user@hostname'),
      host: z.string().describe('Hostname or IP address'),
      port: z.number().int().positive().default(22).describe('SSH port (default 22)'),
      username: z.string().describe('SSH username'),
      password: z.string().optional().describe('Password for authentication'),
      keyPath: z.string().optional().describe('Path to private key (defaults to SSH agent if omitted)'),
    },
    async ({ host_id, host, port, username, password, keyPath }) => {
      try {
        const hosts = await defaultHostStore.listHosts();
        if (hosts.some((entry) => entry.id === host_id)) {
          throw new ValidationError(`Host '${host_id}' already exists`);
        }

        hosts.push({ id: host_id, host, port, username, password, keyPath });
        await defaultHostStore.saveHosts(hosts);
        return { content: [{ type: 'text', text: `Host '${host_id}' added` }] };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool('list-hosts', 'List all stored SSH host configurations.', {}, async () => {
    try {
      const hosts = await defaultHostStore.listHosts();
      if (hosts.length === 0) {
        return { content: [{ type: 'text', text: 'No hosts configured' }] };
      }

      const lines = hosts.map((host) =>
        `id=${host.id} host=${host.host}:${host.port} user=${host.username} auth=${host.password ? 'password' : host.keyPath ? 'key' : 'agent'}`,
      );
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  server.tool(
    'remove-host',
    'Remove a stored SSH host configuration.',
    {
      host_id: z.string().describe('Identifier of the host to remove'),
    },
    async ({ host_id }) => {
      try {
        const hosts = await defaultHostStore.listHosts();
        const next = hosts.filter((host) => host.id !== host_id);
        if (next.length === hosts.length) {
          throw new ValidationError(`Host '${host_id}' does not exist`);
        }
        await defaultHostStore.saveHosts(next);
        return { content: [{ type: 'text', text: `Host '${host_id}' removed` }] };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool(
    'edit-host',
    'Edit fields of an existing host configuration.',
    {
      host_id: z.string().describe('Identifier of the host to edit'),
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      keyPath: z.string().optional(),
    },
    async ({ host_id, host, port, username, password, keyPath }) => {
      try {
        const hosts = await defaultHostStore.listHosts();
        const target = hosts.find((entry) => entry.id === host_id);
        if (!target) {
          throw new ValidationError(`Host '${host_id}' does not exist`);
        }

        if (host) target.host = host;
        if (port) target.port = port;
        if (username) target.username = username;
        if (password !== undefined) target.password = password;
        if (keyPath !== undefined) target.keyPath = keyPath;

        await defaultHostStore.saveHosts(hosts);
        return { content: [{ type: 'text', text: `Host '${host_id}' updated` }] };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool(
    'start-session',
    'Start a new SSH session for a stored host.',
    {
      host_id: z.string().describe('Identifier of the host to connect'),
      sessionId: z.string().optional().describe('Optional session identifier; generated if omitted'),
    },
    async ({ host_id, sessionId }) => {
      try {
        const hostConfig = await defaultHostStore.getConnectConfig(host_id);
        const id = sessionId && sessionId.trim() ? sessionId.trim() : randomUUID();
        await defaultSessionService.startSession(id, hostConfig);
        return { content: [{ type: 'text', text: id }] };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool(
    'exec',
    'Execute a shell command on an existing SSH session.',
    {
      session_id: z.string().describe('Identifier of the session to use'),
      command: z.string().describe('Command to execute'),
    },
    async ({ session_id, command }) => {
      try {
        const sanitizedCommand = sanitizeCommand(command);
        const { output, exitCode } = await defaultSessionService.execute(session_id, sanitizedCommand);
        if (exitCode !== 0) {
          throw new SessionError(`Error (code ${exitCode}):\n${output}`);
        }
        return {
          content: [{ type: 'text', text: output }],
        };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool(
    'close-session',
    'Close an existing persistent SSH session.',
    {
      sessionId: z.string().describe('Identifier of the session to close'),
    },
    async ({ sessionId }) => {
      try {
        await defaultSessionService.closeSession(sessionId);
        return { content: [{ type: 'text', text: `Session '${sessionId}' closed` }] };
      } catch (error) {
        throw toMcpError(error);
      }
    },
  );

  server.tool('list-sessions', 'List all active SSH sessions with metadata.', {}, async () => {
    try {
      const notifications = defaultSessionService.consumeNotifications();
      const sessions = defaultSessionService.listSessions();
      const deadSessions = defaultSessionService.listDeadSessions();
      if (sessions.length === 0 && deadSessions.length === 0) {
        return { content: [{ type: 'text', text: 'No active or dead sessions' }] };
      }

      const lines = notifications.map((notification) => notification);

      lines.push(
        ...sessions.map((session) => {
          const uptimeMs = Date.now() - session.createdAt;
          const minutes = Math.floor(uptimeMs / 60000);
          const seconds = Math.floor((uptimeMs % 60000) / 1000);
          return `session=${session.id} status=active host=${session.host}:${session.port} user=${session.username} uptime=${minutes}m${seconds}s lastCommand=${session.lastCommand ?? 'n/a'} log=${session.logPath}`;
        }),
      );

      lines.push(
        ...deadSessions.map(
          (session) =>
            `session=${session.id} status=dead host=${session.host}:${session.port} user=${session.username} reason=${session.reason} log=${session.logPath}`,
        ),
      );

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    } catch (error) {
      throw toMcpError(error);
    }
  });

  return server;
}

export async function execSshCommand(hostId: string, command: string, sessionId = 'legacy') {
  try {
    const sanitizedCommand = sanitizeCommand(command);
    const config = await defaultHostStore.getConnectConfig(hostId);
    await defaultSessionService.ensureSession(sessionId, config);
    const { output, exitCode } = await defaultSessionService.execute(sessionId, sanitizedCommand);
    if (exitCode !== 0) {
      throw new SessionError(`Error (code ${exitCode}):\n${output}`);
    }
    return {
      content: [{ type: 'text', text: output }],
    };
  } catch (error) {
    throw toMcpError(error);
  }
}

export async function startMcpServer(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ssh-cli MCP server running on stdio');
}

async function main(): Promise<void> {
  await runCliMain();
}

if (process.env.SSH_MCP_DISABLE_MAIN !== '1' && process.env.SSH_CLI_DISABLE_MAIN !== '1') {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}
