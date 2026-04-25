import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { CLIError } from '../errors.js';

export function coerceNumberFlag(flagName: string, value: string | undefined): number {
  if (!value) {
    throw new CLIError(`Flag ${flagName} requires a value`);
  }

  if (!/^\d+$/.test(value)) {
    throw new CLIError(`Flag ${flagName} must be a positive integer`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CLIError(`Flag ${flagName} must be a positive integer`);
  }

  return parsed;
}

export function consumeFlagValue(args: string[], index: number, flagName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new CLIError(`Flag ${flagName} requires a value`);
  }

  return value;
}

export async function readPackageVersion(packageJsonPath: string): Promise<string> {
  const raw = await readFile(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw) as { version?: string };
  return parsed.version ?? '0.0.0';
}

export function formatHelp(version: string, executableName = 'ssh-cli'): string {
  return [
    `${executableName} ${version}`,
    '',
    'Usage:',
    `  ${executableName} <command> [options]`,
    '',
    'Commands:',
    `  add-host <name> --host user@host [--port 22] [--key-path <path>] [--password <password>]`,
    `  start <session-name> --host <host>`,
    `  exec <session-name> [--auto] <command>`,
    `  list`,
    `  ps`,
    `  kill <session-name>`,
    `  close <session-name>`,
    `  logs <session-name> [--lines <n>] [--follow]`,
    `  attach <session-name>`,
    `  mcp [args...]`,
    `  help`,
    `  version`,
    '',
    'Environment:',
    '  SSH_CLI_AI_AUTO_MODE=true   Enable opt-in AI preflight hooks for exec',
    '  SSH_CLI_MAX_INACTIVITY_MS   Override session inactivity timeout',
  ].join('\n');
}

export function resolveExecutableName(argv0: string | undefined, fallback = 'ssh-cli'): string {
  if (!argv0) {
    return fallback;
  }

  const name = basename(argv0);
  return name || fallback;
}
