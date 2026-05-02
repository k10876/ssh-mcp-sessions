import { spawn, type StdioOptions } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import os from 'node:os';

import { CLIError } from '../errors.js';
import type { SessionInfo } from '../types/session.js';
import type { HostRepository, SessionRepository } from './run.js';

const DEFAULT_LOGS_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions', 'logs');

type CommandRunner = (command: string, args: string[], options?: { stdio?: StdioOptions }) => Promise<number>;

export async function readSessionLogs(
  sessionName: string,
  options: { lines?: number; follow: boolean },
  logsDir = DEFAULT_LOGS_DIR,
): Promise<string> {
  const logPath = resolvePath(logsDir, `${sessionName}.log`);
  await access(logPath);

  const raw = await readFile(logPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const visibleLines = typeof options.lines === 'number' ? lines.slice(-options.lines) : lines;
  const body = visibleLines.join('\n').trimEnd();

  if (options.follow) {
    return [body, '', `(follow mode not yet streaming; showing current contents of ${logPath})`].filter(Boolean).join('\n');
  }

  return body;
}

function getSshArgs(session: SessionInfo): string[] {
  const sshArgs = [] as string[];

  if (session.port !== 22) {
    sshArgs.push('-p', String(session.port));
  }

  sshArgs.push('-t', `${session.username}@${session.host}`);
  return sshArgs;
}

function getLocalTmuxSessionName(sessionName: string): string {
  const normalized = sessionName.trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  return `ssh-cli-${normalized || 'session'}`;
}

function createLocalTmuxCommand(sessionName: string, session: SessionInfo): string {
  const tmuxSessionName = getLocalTmuxSessionName(sessionName);
  const commandParts = ['tmux', 'new-session', '-A', '-s', tmuxSessionName, 'ssh', ...getSshArgs(session)];
  return commandParts.join(' ');
}

function createSpawnRunner(): CommandRunner {
  return async (command, args, options) =>
    new Promise<number>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: options?.stdio ?? 'inherit',
      });

      child.once('error', (error) => {
        reject(error);
      });

      child.once('close', (code) => {
        resolve(code ?? 1);
      });
    });
}

export function createAttachSession(deps: {
  hostStore: HostRepository;
  sessionService: SessionRepository;
  env?: NodeJS.ProcessEnv;
  runCommand?: CommandRunner;
}): (sessionName: string) => Promise<void> {
  const runCommand = deps.runCommand ?? createSpawnRunner();

  return async (sessionName: string) => {
    const session = await deps.sessionService.getSessionInfo(sessionName);
    const hosts = await deps.hostStore.listHosts();
    const matchingHost = hosts.find(
      (host) => host.host === session.host && host.username === session.username && (host.port ?? 22) === session.port,
    );

    const localSessionName = getLocalTmuxSessionName(sessionName);

    try {
      const createExitCode = await runCommand(
        'tmux',
        ['new-session', '-Ad', '-s', localSessionName, 'ssh', ...getSshArgs(session)],
        { stdio: 'inherit' },
      );

      if (createExitCode !== 0) {
        throw new CLIError(
          `Failed to prepare local tmux session '${localSessionName}' for '${sessionName}' (exit ${createExitCode})`,
        );
      }

      const attachArgs = deps.env?.TMUX
        ? ['switch-client', '-t', localSessionName]
        : ['attach-session', '-t', localSessionName];
      const attachExitCode = await runCommand('tmux', attachArgs, { stdio: 'inherit' });

      if (attachExitCode !== 0) {
        throw new CLIError(`Failed to attach local tmux session '${localSessionName}' for '${sessionName}' (exit ${attachExitCode})`);
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        const hostHint = matchingHost ? ` Stored host id: ${matchingHost.id}.` : '';
        throw new CLIError(
          `Local tmux is required for 'ssh-cli attach'. Install tmux on this machine and rerun; the remote host does not need tmux.${hostHint}`,
        );
      }

      throw error;
    }
  };
}

export function createAttachFallbackMessage(sessionName: string, session: SessionInfo): string {
  return [
    `Local attach requires tmux. Run:`,
    `  ${createLocalTmuxCommand(sessionName, session)}`,
    'This uses tmux on the local machine only; the remote host does not need tmux.',
  ].join('\n');
}
