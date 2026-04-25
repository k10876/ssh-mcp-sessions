import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { resolve as resolvePath } from 'node:path';

import type { ConnectConfig } from 'ssh2';

import { HostNotFoundError, HostStoreError } from '../errors.js';
import { HostsSchema, type StoredHost } from '../types/host.js';
import { expandPath } from '../utils/path-utils.js';

export type HostStoreOptions = {
  hostsDir?: string;
  hostsFile?: string;
};

const DEFAULT_HOSTS_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions');
const DEFAULT_HOSTS_FILE = resolvePath(DEFAULT_HOSTS_DIR, 'hosts.json');

export class HostStore {
  private readonly hostsDir: string;
  private readonly hostsFile: string;

  constructor(options: HostStoreOptions = {}) {
    this.hostsDir = options.hostsDir ?? DEFAULT_HOSTS_DIR;
    this.hostsFile = options.hostsFile ?? DEFAULT_HOSTS_FILE;
  }

  async ensureStore(): Promise<void> {
    await mkdir(this.hostsDir, { recursive: true, mode: 0o700 });
    await chmod(this.hostsDir, 0o700).catch(() => undefined);

    try {
      const stats = await stat(this.hostsFile);
      if (!stats.isFile()) {
        throw new HostStoreError(`${this.hostsFile} exists but is not a file`);
      }
      await chmod(this.hostsFile, 0o600).catch(() => undefined);
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'ENOENT') {
        throw error;
      }

      await this.writeWrapped({ hosts: [] });
    }
  }

  async listHosts(): Promise<StoredHost[]> {
    await this.ensureStore();

    let raw: string;
    try {
      raw = await readFile(this.hostsFile, 'utf8');
    } catch (error) {
      throw new HostStoreError(`Failed to read hosts.json: ${(error as Error).message}`);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw || '{}');
    } catch (error) {
      throw new HostStoreError(`Failed to parse hosts.json: ${(error as Error).message}`);
    }

    const parsed = HostsSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new HostStoreError(`Failed to parse hosts.json: ${parsed.error.message}`);
    }

    return parsed.data.hosts;
  }

  async saveHosts(hosts: StoredHost[]): Promise<void> {
    await this.ensureStore();
    await this.writeWrapped({ hosts });
  }

  async getHost(hostId: string): Promise<StoredHost> {
    const hosts = await this.listHosts();
    const host = hosts.find((entry) => entry.id === hostId);
    if (!host) {
      throw new HostNotFoundError(`Host '${hostId}' not found`);
    }

    return host;
  }

  async getConnectConfig(hostId: string): Promise<ConnectConfig> {
    const host = await this.getHost(hostId);
    const config: ConnectConfig = {
      host: host.host,
      port: host.port ?? 22,
      username: host.username,
    };

    if (host.password) {
      config.password = host.password;
    } else if (host.keyPath) {
      const expanded = expandPath(host.keyPath);
      if (!expanded) {
        throw new HostStoreError(`Invalid key path for host '${hostId}'`);
      }

      try {
        config.privateKey = await readFile(expanded, 'utf8');
      } catch (error) {
        throw new HostStoreError(`Failed to read private key for host '${hostId}': ${(error as Error).message}`);
      }
    } else if (process.env.SSH_AUTH_SOCK) {
      config.agent = process.env.SSH_AUTH_SOCK;
      config.agentForward = true;
    }

    return config;
  }

  private async writeWrapped(payload: { hosts: StoredHost[] }): Promise<void> {
    const tempFile = `${this.hostsFile}.${randomUUID()}.tmp`;

    try {
      await writeFile(tempFile, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      await chmod(tempFile, 0o600).catch(() => undefined);
      await rename(tempFile, this.hostsFile);
      await chmod(this.hostsFile, 0o600).catch(() => undefined);
    } catch (error) {
      await unlink(tempFile).catch(() => undefined);
      throw new HostStoreError(`Failed to write hosts.json: ${(error as Error).message}`);
    }
  }
}

export const defaultHostStore = new HostStore();
