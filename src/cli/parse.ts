import { ZodError } from 'zod';

import { CLIError } from '../errors.js';
import { sanitizeCommand } from '../utils/command-utils.js';
import { consumeFlagValue, coerceNumberFlag } from './formatting.js';
import { CliAddHostOptionsSchema, type CliExecOptions, type CliLogsOptions, type ParsedCliCommand } from './types.js';

function parseHostTarget(target: string): { username: string; host: string } {
  const atIndex = target.indexOf('@');
  if (atIndex <= 0 || atIndex === target.length - 1) {
    throw new CLIError('Host must be in the form user@host');
  }

  return {
    username: target.slice(0, atIndex),
    host: target.slice(atIndex + 1),
  };
}

function parseRequiredTrimmedArgument(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new CLIError(message);
  }

  return trimmed;
}

export function parseCliArgs(argv: string[]): ParsedCliCommand {
  if (argv.length === 0) {
    return { kind: 'help' };
  }

  const [command, ...rest] = argv;

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      return { kind: 'help', topic: rest[0] };
    case 'version':
    case '--version':
    case '-v':
      return { kind: 'version' };
    case 'list':
    case 'ps':
      ensureNoExtraArgs(command, rest);
      return { kind: 'list' };
    case 'kill':
    case 'close':
      return { kind: 'kill', sessionName: expectSingleArg(command, rest, 'session name') };
    case 'attach':
      return { kind: 'attach', sessionName: expectSingleArg(command, rest, 'session name') };
    case 'mcp':
      return { kind: 'mcp', args: rest };
    case 'start':
      return parseStart(rest);
    case 'add-host':
      return parseAddHost(rest);
    case 'exec':
      return parseExec(rest);
    case 'logs':
      return parseLogs(rest);
    default:
      throw new CLIError(`Unknown command '${command}'. Run 'ssh-cli help' for usage.`);
  }
}

function parseAddHost(args: string[]): ParsedCliCommand {
  if (args.length === 0) {
    throw new CLIError('add-host requires a host name');
  }

  const [name, ...rest] = args;
  if (!name.trim()) {
    throw new CLIError('add-host requires a non-empty host name');
  }

  let hostTarget: string | undefined;
  let port = 22;
  let keyPath: string | undefined;
  let password: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case '--host':
        hostTarget = consumeFlagValue(rest, index, '--host');
        index += 1;
        break;
      case '--port':
        port = coerceNumberFlag('--port', consumeFlagValue(rest, index, '--port'));
        index += 1;
        break;
      case '--key-path':
        keyPath = consumeFlagValue(rest, index, '--key-path');
        index += 1;
        break;
      case '--password':
        password = consumeFlagValue(rest, index, '--password');
        index += 1;
        break;
      default:
        throw new CLIError(`Unknown option for add-host: ${arg}`);
    }
  }

  if (!hostTarget) {
    throw new CLIError('add-host requires --host user@host');
  }

  const { username, host } = parseHostTarget(hostTarget);

  try {
    const options = CliAddHostOptionsSchema.parse({
      host,
      port,
      ...(keyPath ? { keyPath } : {}),
      ...(password !== undefined ? { password } : {}),
    });
    return {
      kind: 'add-host',
      name,
      username,
      options,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      throw new CLIError(toValidationMessage(error));
    }
    throw error;
  }
}

function parseStart(args: string[]): ParsedCliCommand {
  if (args.length === 0) {
    throw new CLIError('start requires a session name');
  }

  const [rawSessionName, ...rest] = args;
  const sessionName = parseRequiredTrimmedArgument(rawSessionName, 'start requires a session name');
  let host: string | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case '--host':
        host = consumeFlagValue(rest, index, '--host');
        index += 1;
        break;
      default:
        throw new CLIError(`Unknown option for start: ${arg}`);
    }
  }

  if (!host) {
    throw new CLIError('start requires --host <host>');
  }

  return {
    kind: 'start',
    sessionName,
    options: { host },
  };
}

function parseExec(args: string[]): ParsedCliCommand {
  if (args.length < 2) {
    throw new CLIError('exec requires a session name and command');
  }

  const [rawSessionName, ...rest] = args;
  const sessionName = parseRequiredTrimmedArgument(rawSessionName, 'exec requires a session name');
  const options: CliExecOptions = { auto: false };
  const commandParts: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--auto') {
      options.auto = true;
      continue;
    }

    commandParts.push(...rest.slice(index));
    break;
  }

  if (commandParts.length === 0) {
    throw new CLIError('exec requires a command');
  }

  return {
    kind: 'exec',
    sessionName,
    command: sanitizeCommand(commandParts.join(' ')),
    options,
  };
}

function parseLogs(args: string[]): ParsedCliCommand {
  if (args.length === 0) {
    throw new CLIError('logs requires a session name');
  }

  const [rawSessionName, ...rest] = args;
  const sessionName = parseRequiredTrimmedArgument(rawSessionName, 'logs requires a session name');
  const options: CliLogsOptions = { follow: false };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case '--follow':
        options.follow = true;
        break;
      case '--tail':
      case '--lines':
        options.lines = coerceNumberFlag(arg, consumeFlagValue(rest, index, arg));
        index += 1;
        break;
      default:
        throw new CLIError(`Unknown option for logs: ${arg}`);
    }
  }

  return {
    kind: 'logs',
    sessionName,
    options,
  };
}

function ensureNoExtraArgs(command: string, args: string[]): void {
  if (args.length > 0) {
    throw new CLIError(`${command} does not accept extra arguments`);
  }
}

function expectSingleArg(command: string, args: string[], label: string): string {
  if (args.length !== 1 || !args[0]?.trim()) {
    throw new CLIError(`${command} requires a ${label}`);
  }

  return args[0].trim();
}

export function toValidationMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}
