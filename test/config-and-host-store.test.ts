import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { join } from 'node:path';

import { getMaxInactivityMs } from '../src/config.js';
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
