import { describe, expect, it } from 'vitest';

import { escapeCommandForShell, sanitizeCommand } from '../src/utils/command-utils.js';
import { expandPath } from '../src/utils/path-utils.js';

describe('path utils', () => {
  it('expands home directory prefixes', () => {
    expect(expandPath('~')).toBe(process.env.HOME);
    expect(expandPath('~/project')).toBe(`${process.env.HOME}/project`);
  });

  it('resolves plain relative paths', () => {
    expect(expandPath('docs/readme')).toContain('docs/readme');
  });
});

describe('command utils', () => {
  it('trims commands', () => {
    expect(sanitizeCommand('  pwd  ')).toBe('pwd');
  });

  it('rejects blank commands', () => {
    expect(() => sanitizeCommand('   ')).toThrow('Command cannot be empty');
  });

  it('rejects overly long commands', () => {
    expect(() => sanitizeCommand('x'.repeat(15001))).toThrow('Command is too long');
  });

  it('escapes single quotes for shell usage', () => {
    expect(escapeCommandForShell(`echo 'hi'`)).toBe(`echo '"'"'hi'"'"'`);
  });
});
