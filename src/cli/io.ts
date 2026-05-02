import { access, readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import os from 'node:os';

import type { HostRepository, SessionRepository } from './run.js';

const DEFAULT_LOGS_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions', 'logs');

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

export function createAttachInstructions(deps: {
  hostStore: HostRepository;
  sessionService: SessionRepository;
}): (sessionName: string) => Promise<string> {
  return async (sessionName: string) => {
    const session = await deps.sessionService.getSessionInfo(sessionName);
    const hosts = await deps.hostStore.listHosts();
    const matchingHost = hosts.find(
      (host) => host.host === session.host && host.username === session.username && (host.port ?? 22) === session.port,
    );

    const target = `${session.username}@${session.host}`;
    const sshParts = ['ssh'];
    if (session.port !== 22) {
      sshParts.push('-p', String(session.port));
    }
    sshParts.push('-t', target, `"tmux attach -t ssh-cli-${sessionName} || tmux new -s ssh-cli-${sessionName}"`);

    const lines = [
      `Attach to '${sessionName}' with:`,
      `  ${sshParts.join(' ')}`,
    ];

    if (matchingHost) {
      lines.push(`Stored host id: ${matchingHost.id}`);
    }

    lines.push('If tmux is not installed on the remote host, install tmux first and rerun attach.');
    return lines.join('\n');
  };
}
