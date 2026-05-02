import { ValidationError } from '../errors.js';

const MAX_COMMAND_LENGTH = 15000;

export function sanitizeCommand(command: string, options: { preserveWhitespace?: boolean } = {}): string {
  if (typeof command !== 'string') {
    throw new ValidationError('Command must be a string');
  }

  if (!options.preserveWhitespace) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      throw new ValidationError('Command cannot be empty');
    }

    if (trimmedCommand.length > MAX_COMMAND_LENGTH) {
      throw new ValidationError('Command is too long (max 15000 characters)');
    }

    return trimmedCommand;
  }

  if (command.length === 0) {
    throw new ValidationError('Command cannot be empty');
  }

  if (command.length > MAX_COMMAND_LENGTH) {
    throw new ValidationError('Command is too long (max 15000 characters)');
  }

  return command;
}

export function escapeCommandForShell(command: string): string {
  return command.replace(/'/g, "'\"'\"'");
}
