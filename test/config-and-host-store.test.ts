import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { compileExecReminderRules, getMatchingExecReminders, getMaxInactivityMs, loadUserConfig } from '../src/config.js';
import { HostStore } from '../src/services/host-store.js';

describe('config', () => {
  it('defaults max inactivity to 24 hours', () => {
    expect(getMaxInactivityMs({} as NodeJS.ProcessEnv)).toBe(24 * 60 * 60 * 1000);
  });

  it('uses SSH_CLI_MAX_INACTIVITY_MS when valid', () => {
    expect(getMaxInactivityMs({ SSH_CLI_MAX_INACTIVITY_MS: '1234' } as NodeJS.ProcessEnv)).toBe(1234);
  });

  it('falls back when env is invalid', () => {
    expect(getMaxInactivityMs({ SSH_CLI_MAX_INACTIVITY_MS: 'nope' } as NodeJS.ProcessEnv)).toBe(24 * 60 * 60 * 1000);
  });

  it('falls back when env contains non-numeric suffixes', () => {
    expect(getMaxInactivityMs({ SSH_CLI_MAX_INACTIVITY_MS: '1234ms' } as NodeJS.ProcessEnv)).toBe(24 * 60 * 60 * 1000);
  });

  it('loads exec reminder rules from config.yaml', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-config-'));
    const configPath = join(tempDir, 'config.yaml');
    await writeFile(
      configPath,
      [
        'exec:',
        '  reminders:',
        '    - when: input',
        '      pattern: sbatch',
        '      reminder: Check queue status with squeue.',
        '    - when: output',
        '      pattern: Submitted batch job',
        '      reminder: Capture the job id for follow-up.',
      ].join('\n'),
      'utf8',
    );

    await expect(loadUserConfig(configPath)).resolves.toEqual({
      exec: {
        reminders: [
          { when: 'input', pattern: 'sbatch', reminder: 'Check queue status with squeue.' },
          { when: 'output', pattern: 'Submitted batch job', reminder: 'Capture the job id for follow-up.' },
        ],
      },
    });
  });

  it('rejects invalid reminder config shape clearly', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-config-'));
    const configPath = join(tempDir, 'config.yaml');
    await writeFile(configPath, ['exec:', '  reminders:', '    - when: command', '      pattern: sbatch'].join('\n'), 'utf8');

    await expect(loadUserConfig(configPath)).rejects.toThrow(/Invalid config/);
  });

  it('rejects invalid reminder regex clearly', () => {
    expect(() =>
      compileExecReminderRules([{ when: 'both', pattern: '(', reminder: 'broken regex reminder' }]),
    ).toThrow(/Invalid exec reminder regex/);
  });

  it('matches reminder rules against input and output text', () => {
    const rules = compileExecReminderRules([
      { when: 'input', pattern: 'sbatch', reminder: 'input reminder' },
      { when: 'output', pattern: 'Submitted batch job', reminder: 'output reminder' },
      { when: 'both', pattern: 'job', reminder: 'either reminder' },
    ]);

    expect(getMatchingExecReminders('sbatch deploy.sh', 'Submitted batch job 123', rules)).toEqual([
      'input reminder',
      'output reminder',
      'either reminder',
    ]);
  });
});

describe('host store', () => {
  let tempDir = '';

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates and validates the hosts file', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-host-store-'));
    const store = new HostStore({
      hostsDir: join(tempDir, '.ssh-cli-sessions'),
      hostsFile: join(tempDir, '.ssh-cli-sessions', 'hosts.json'),
    });

    expect(await store.listHosts()).toEqual([]);

    await store.saveHosts([
      { id: 'dev', host: 'example.com', port: 22, username: 'alice', keyPath: '~/.ssh/id_ed25519' },
    ]);

    expect(await store.listHosts()).toEqual([
      { id: 'dev', host: 'example.com', port: 22, username: 'alice', keyPath: '~/.ssh/id_ed25519' },
    ]);
  });

  it('rejects malformed hosts content', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-host-store-'));
    const hostsDir = join(tempDir, '.ssh-cli-sessions');
    const hostsFile = join(hostsDir, 'hosts.json');
    const store = new HostStore({ hostsDir, hostsFile });

    await store.ensureStore();
    await writeFile(hostsFile, JSON.stringify({ hosts: [{ id: 1 }] }), 'utf8');

    await expect(store.listHosts()).rejects.toThrow('Failed to parse hosts.json');
  });

  it('writes hosts atomically as wrapped json', async () => {
    tempDir = await mkdtemp(join(os.tmpdir(), 'ssh-cli-host-store-'));
    const hostsDir = join(tempDir, '.ssh-cli-sessions');
    const hostsFile = join(hostsDir, 'hosts.json');
    const store = new HostStore({ hostsDir, hostsFile });

    await store.saveHosts([
      { id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' },
    ]);

    const raw = await readFile(hostsFile, 'utf8');
    expect(JSON.parse(raw)).toEqual({
      hosts: [{ id: 'dev', host: 'example.com', port: 22, username: 'alice', password: 'secret' }],
    });
  });
});
