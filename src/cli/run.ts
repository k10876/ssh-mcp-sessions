import { readFile } from 'node:fs/promises';
import type { CliTransferOptions } from './types.js';
import type { ConnectConfig } from 'ssh2';

import { compileExecReminderRules, getMatchingExecReminders, loadUserConfig } from '../config.js';
import { CLIError, ValidationError } from '../errors.js';
import type { DeadSessionInfo } from '../types/dead-session.js';
import type { ActiveSessionInfo, CommandResult, SessionInfo } from '../types/session.js';
import type { StoredHost } from '../types/host.js';
import { sanitizeCommand } from '../utils/command-utils.js';
import { createAttachFallbackMessage } from './io.js';

export interface HostRepository {
  listHosts(): Promise<StoredHost[]>;
  saveHosts(hosts: StoredHost[]): Promise<void>;
  getHost(hostId: string): Promise<StoredHost>;
  getConnectConfig(hostId: string): Promise<ConnectConfig>;
}

export interface SessionRepository {
  startSession(id: string, config: ConnectConfig): Promise<SessionInfo>;
  execute(id: string, command: string): Promise<CommandResult>;
  closeSession(id: string): Promise<void>;
  getSessionInfo(id: string): Promise<SessionInfo> | SessionInfo;
  listSessions(): Promise<ActiveSessionInfo[]> | ActiveSessionInfo[];
  listDeadSessions(): Promise<DeadSessionInfo[]> | DeadSessionInfo[];
  consumeNotifications(): Promise<string[]> | string[];
}

export type CliDependencies = {
  hostStore: HostRepository;
  sessionService: SessionRepository;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
  stderr?: Pick<NodeJS.WriteStream, 'write'>;
  packageVersion: string;
  executableName?: string;
  readLogs?: (sessionName: string, options: { lines?: number; follow: boolean }) => Promise<string>;
  attachSession?: (sessionName: string) => Promise<void>;
  putPath?: (options: CliTransferOptions) => Promise<string>;
  getPath?: (options: CliTransferOptions) => Promise<string>;
  loadUserConfig?: typeof loadUserConfig;
};

function writeLine(stream: Pick<NodeJS.WriteStream, 'write'>, text: string): void {
  stream.write(`${text}\n`);
}

function redactHost(host: StoredHost): string {
  return host.password ? 'password' : host.keyPath ? 'key' : 'agent';
}

function isAutoModeEnabled(env: NodeJS.ProcessEnv | undefined, flagEnabled: boolean): boolean {
  if (flagEnabled) {
    return true;
  }

  return env?.SSH_CLI_AI_AUTO_MODE === 'true';
}

export async function runCliCommand(parsed: import('./types.js').ParsedCliCommand, deps: CliDependencies): Promise<number> {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const env = deps.env ?? process.env;

  switch (parsed.kind) {
    case 'help': {
      const { formatHelp } = await import('./formatting.js');
      writeLine(stdout, formatHelp(deps.packageVersion, deps.executableName));
      return 0;
    }
    case 'version':
      writeLine(stdout, deps.packageVersion);
      return 0;
    case 'add-host': {
      const hosts = await deps.hostStore.listHosts();
      if (hosts.some((host) => host.id === parsed.name)) {
        throw new ValidationError(`Host '${parsed.name}' already exists`);
      }

      await deps.hostStore.saveHosts([
        ...hosts,
        {
          id: parsed.name,
          host: parsed.options.host,
          port: parsed.options.port,
          username: parsed.username,
          password: parsed.options.password,
          keyPath: parsed.options.keyPath,
        },
      ]);

      writeLine(stdout, `Added host '${parsed.name}' (${parsed.username}@${parsed.options.host}:${parsed.options.port}, auth: ${parsed.options.password ? 'password' : parsed.options.keyPath ? 'key' : 'agent'})`);
      return 0;
    }
    case 'start': {
      const config = await deps.hostStore.getConnectConfig(parsed.options.host);
      const info = await deps.sessionService.startSession(parsed.sessionName, config);
      writeLine(stdout, `Started session '${info.id}' on ${info.username}@${info.host}:${info.port}`);
      return 0;
    }
    case 'exec': {
      const autoMode = isAutoModeEnabled(env, parsed.options.auto);
      if (autoMode) {
        writeLine(stderr, '[ai-auto] AI auto mode hook enabled; proceeding without external review provider');
      }

      const command = parsed.options.filePath
        ? await readCommandFile(parsed.options.filePath)
        : sanitizeCommand(parsed.command);
      const userConfig = await (deps.loadUserConfig ?? loadUserConfig)();
      const reminderRules = compileExecReminderRules(userConfig.exec.reminders);

      const result = await deps.sessionService.execute(parsed.sessionName, command);
      const reminders = getMatchingExecReminders(command, result.output, reminderRules);
      const renderedOutput = renderExecOutputWithReminders(result.output, reminders);

      if (renderedOutput) {
        writeLine(stdout, renderedOutput);
      }
      if (result.exitCode !== 0) {
        writeLine(stderr, `Command failed in session '${parsed.sessionName}' with exit code ${result.exitCode}`);
        return result.exitCode;
      }
      return 0;
    }
    case 'list': {
      const notifications = await deps.sessionService.consumeNotifications();
      for (const notification of notifications) {
        writeLine(stderr, notification);
      }

      const hosts = await deps.hostStore.listHosts();
      const sessions = await deps.sessionService.listSessions();
      const deadSessions = await deps.sessionService.listDeadSessions();

      if (sessions.length === 0 && deadSessions.length === 0 && hosts.length === 0) {
        writeLine(stdout, 'No hosts or sessions found.');
        return 0;
      }

      if (sessions.length > 0) {
        writeLine(stdout, 'Sessions:');
        for (const session of sessions) {
          writeLine(
            stdout,
            `- ${session.id}\tactive\t${session.username}@${session.host}:${session.port}\tlast=${session.lastCommand ?? 'n/a'}\tlog=${session.logPath}`,
          );
        }
      } else {
        writeLine(stdout, 'Sessions: none');
      }

      if (deadSessions.length > 0) {
        writeLine(stdout, 'Dead sessions:');
        for (const session of deadSessions) {
          writeLine(
            stdout,
            `- ${session.id}\tdead\t${session.username}@${session.host}:${session.port}\treason=${session.reason}\tlog=${session.logPath}`,
          );
        }
      } else {
        writeLine(stdout, 'Dead sessions: none');
      }

      if (hosts.length > 0) {
        writeLine(stdout, 'Hosts:');
        for (const host of hosts) {
          writeLine(stdout, `- ${host.id}\t${host.username}@${host.host}:${host.port ?? 22}\tauth=${redactHost(host)}`);
        }
      } else {
        writeLine(stdout, 'Hosts: none');
      }

      return 0;
    }
    case 'kill':
      await deps.sessionService.closeSession(parsed.sessionName);
      writeLine(stdout, `Closed session '${parsed.sessionName}'`);
      return 0;
    case 'logs': {
      if (!deps.readLogs) {
        throw new ValidationError('Log viewing is not available in this build');
      }
      const output = await deps.readLogs(parsed.sessionName, parsed.options);
      if (output) {
        writeLine(stdout, output);
    }
      return 0;
    }
    case 'attach': {
      if (deps.attachSession) {
        await deps.attachSession(parsed.sessionName);
      } else {
        const session = await deps.sessionService.getSessionInfo(parsed.sessionName);
        writeLine(stdout, createAttachFallbackMessage(parsed.sessionName, session));
      }
      return 0;
    }
    case 'put': {
      if (!deps.putPath) {
        throw new ValidationError('File upload is not available in this build');
      }
      writeLine(stdout, await deps.putPath(parsed.options));
      return 0;
    }
    case 'get': {
      if (!deps.getPath) {
        throw new ValidationError('File download is not available in this build');
      }
      writeLine(stdout, await deps.getPath(parsed.options));
      return 0;
    }
  }
}

async function readCommandFile(filePath: string): Promise<string> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return sanitizeCommand(raw, { preserveWhitespace: true });
  } catch (error) {
    throw new CLIError(`Failed to read exec command file '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderExecOutputWithReminders(output: string, reminders: string[]): string {
  if (reminders.length === 0) {
    return output;
  }

  const reminderBlock = reminders.join('\n');
  if (!output) {
    return reminderBlock;
  }

  return `${output}\nIMPORTANT! Please follow these instructions: ${reminderBlock}`;
}
