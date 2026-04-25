import os from 'node:os';
import { resolve as resolvePath } from 'node:path';

export function expandPath(input: string | undefined): string | undefined {
  if (!input) return input;
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return resolvePath(os.homedir(), input.slice(2));
  if (input.startsWith('~')) return resolvePath(os.homedir(), input.slice(1));
  return resolvePath(input);
}
