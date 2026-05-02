import { appendFile, chmod, mkdir, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import { join as joinLocalPath, posix as posixPath, resolve as resolvePath } from 'node:path';

import type { ConnectConfig } from 'ssh2';
import SSH2Module from 'ssh2';

import { CLIError } from '../errors.js';
import type { CliTransferOptions } from './types.js';

const { Client: SSHClient } = SSH2Module as typeof import('ssh2');

const DEFAULT_LOGS_DIR = resolvePath(os.homedir(), '.ssh-cli-sessions', 'logs');
const DEFAULT_TRANSFER_LOG = resolvePath(DEFAULT_LOGS_DIR, 'transfers.log');

type PathStatsLike = {
  isDirectory(): boolean;
};

type LocalDirEntryLike = {
  name: string;
  parentPath: string;
  isDirectory(): boolean;
};

type RemoteDirEntryLike = {
  filename: string;
  attrs: PathStatsLike;
};

type RawSftpClient = {
  stat(path: string, callback: (error: Error | undefined, stats?: PathStatsLike) => void): void;
  readdir(path: string, callback: (error: Error | undefined, entries?: RemoteDirEntryLike[]) => void): void;
  mkdir(path: string, callback: (error?: Error) => void): void;
  fastPut(localPath: string, remotePath: string, callback: (error?: Error) => void): void;
  fastGet(remotePath: string, localPath: string, callback: (error?: Error) => void): void;
};

export type SftpClientLike = {
  stat(path: string): Promise<PathStatsLike>;
  readdir(path: string): Promise<RemoteDirEntryLike[]>;
  mkdir(path: string, recursive?: boolean): Promise<void>;
  fastPut(localPath: string, remotePath: string): Promise<void>;
  fastGet(remotePath: string, localPath: string): Promise<void>;
};

type SshClientLike = {
  connect(config: ConnectConfig): Promise<void>;
  openSftp(): Promise<SftpClientLike | RawSftpClient>;
  end(): void;
};

export type TransferSshClientFactory = () => SshClientLike;
export type TransferLogger = (hostId: string, message: string) => Promise<void>;

type PutPathOptions = CliTransferOptions & {
  statLocalPath?: (path: string) => Promise<PathStatsLike>;
  readLocalDir?: (path: string) => Promise<LocalDirEntryLike[]>;
};

type GetPathOptions = CliTransferOptions & {
  mkdirLocalDir?: (path: string) => Promise<void>;
};

export function createTransferHandlers(args: {
  getConnectConfig: (hostId: string) => Promise<ConnectConfig>;
  createClient?: TransferSshClientFactory;
  logger?: TransferLogger;
}) {
  const createClient = args.createClient ?? createSshClient;
  const logger = args.logger;

  return {
    async putPath(options: PutPathOptions): Promise<string> {
      const localStat = await (options.statLocalPath ?? stat)(options.sourcePath);
      if (localStat.isDirectory() && !options.recursive) {
        throw new CLIError(`Local path '${options.sourcePath}' is a directory; rerun with --recursive`);
      }

      const client = createClient();
      try {
        await client.connect(await args.getConnectConfig(options.host));
         const sftp = normalizeSftpClient(await client.openSftp());

        if (localStat.isDirectory()) {
          await sftp.mkdir(options.destinationPath, true);
          await uploadDirectory({
            sftp,
            localDirPath: options.sourcePath,
            remoteDirPath: options.destinationPath,
            readLocalDir: options.readLocalDir ?? readLocalDirectory,
            statLocalPath: options.statLocalPath ?? stat,
          });
          await logger?.(options.host, `PUT_RECURSIVE from=${options.sourcePath} to=${options.destinationPath}`);
        } else {
          await sftp.fastPut(options.sourcePath, options.destinationPath);
          await logger?.(options.host, `PUT from=${options.sourcePath} to=${options.destinationPath}`);
        }

        return `Uploaded '${options.host}:${options.sourcePath}' to '${options.host}:${options.destinationPath}'`;
      } catch (error) {
        await logger?.(options.host, `PUT_ERROR from=${options.sourcePath} to=${options.destinationPath} error=${sanitizeLogText((error as Error).message)}`);
        throw error;
      } finally {
        client.end();
      }
    },

    async getPath(options: GetPathOptions): Promise<string> {
      const client = createClient();
      try {
        await client.connect(await args.getConnectConfig(options.host));
         const sftp = normalizeSftpClient(await client.openSftp());
        const remoteStat = await sftp.stat(options.sourcePath);

        if (remoteStat.isDirectory() && !options.recursive) {
          throw new CLIError(`Remote path '${options.sourcePath}' is a directory; rerun with --recursive`);
        }

        if (remoteStat.isDirectory()) {
          const mkdirLocalDir = options.mkdirLocalDir ?? defaultMkdirLocalDir;
          await mkdirLocalDir(options.destinationPath);
          await downloadDirectory({
            sftp,
            remoteDirPath: options.sourcePath,
            localDirPath: options.destinationPath,
            mkdirLocalDir,
          });
          await logger?.(options.host, `GET_RECURSIVE from=${options.sourcePath} to=${options.destinationPath}`);
        } else {
          await sftp.fastGet(options.sourcePath, options.destinationPath);
          await logger?.(options.host, `GET from=${options.sourcePath} to=${options.destinationPath}`);
        }

        return `Downloaded '${options.host}:${options.sourcePath}' to '${options.destinationPath}'`;
      } catch (error) {
        await logger?.(options.host, `GET_ERROR from=${options.sourcePath} to=${options.destinationPath} error=${sanitizeLogText((error as Error).message)}`);
        throw error;
      } finally {
        client.end();
      }
    },
  };
}

async function uploadDirectory(args: {
  sftp: SftpClientLike;
  localDirPath: string;
  remoteDirPath: string;
  readLocalDir: (path: string) => Promise<LocalDirEntryLike[]>;
  statLocalPath: (path: string) => Promise<PathStatsLike>;
}): Promise<void> {
  const entries = (await args.readLocalDir(args.localDirPath)).filter((entry) => entry.parentPath === args.localDirPath);

  for (const entry of entries) {
    const localChildPath = joinLocalPath(args.localDirPath, entry.name);
    const remoteChildPath = posixPath.join(args.remoteDirPath, entry.name);

    if (entry.isDirectory()) {
      await args.sftp.mkdir(remoteChildPath, true);
      const childStat = await args.statLocalPath(localChildPath);
      if (childStat.isDirectory()) {
        await uploadDirectory({
          ...args,
          localDirPath: localChildPath,
          remoteDirPath: remoteChildPath,
        });
      }
      continue;
    }

    await args.sftp.fastPut(localChildPath, remoteChildPath);
  }
}

async function downloadDirectory(args: {
  sftp: SftpClientLike;
  remoteDirPath: string;
  localDirPath: string;
  mkdirLocalDir: (path: string) => Promise<void>;
}): Promise<void> {
  const entries = await args.sftp.readdir(args.remoteDirPath);

  for (const entry of entries) {
    const remoteChildPath = posixPath.join(args.remoteDirPath, entry.filename);
    const localChildPath = joinLocalPath(args.localDirPath, entry.filename);

    if (entry.attrs.isDirectory()) {
      await args.mkdirLocalDir(localChildPath);
      await downloadDirectory({
        ...args,
        remoteDirPath: remoteChildPath,
        localDirPath: localChildPath,
      });
      continue;
    }

    await args.sftp.fastGet(remoteChildPath, localChildPath);
  }
}

async function readLocalDirectory(path: string): Promise<LocalDirEntryLike[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    parentPath: path,
    isDirectory: () => entry.isDirectory(),
  }));
}

async function defaultMkdirLocalDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export function createTransferLogger(logPath = DEFAULT_TRANSFER_LOG): TransferLogger {
  return async (hostId, message) => {
    const logDir = resolvePath(logPath, '..');
    await mkdir(logDir, { recursive: true, mode: 0o700 });
    await chmod(logDir, 0o700).catch(() => undefined);
    const timestamp = new Date().toISOString();
    await appendFile(logPath, `[${timestamp}] host=${hostId} ${sanitizeLogText(message)}\n`, { encoding: 'utf8', mode: 0o600 });
  };
}

function createSshClient(): SshClientLike {
  const client = new SSHClient();

  return {
    connect(config) {
      return new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          client.off('ready', onReady);
          client.off('error', onError);
        };

        client.once('ready', onReady);
        client.once('error', onError);
        client.connect(config);
      });
    },
    openSftp() {
      return new Promise<SftpClientLike>((resolve, reject) => {
        client.sftp((error, sftp) => {
          if (error || !sftp) {
            reject(error ?? new Error('Failed to open SFTP session'));
            return;
          }

          resolve(wrapSftpClient(sftp as unknown as RawSftpClient));
        });
      });
    },
    end() {
      client.end();
    },
  };
}

function wrapSftpClient(sftp: RawSftpClient): SftpClientLike {
  return {
    stat(path) {
      return new Promise<PathStatsLike>((resolve, reject) => {
        sftp.stat(path, (error, stats) => {
          if (error) {
            reject(error);
            return;
          }
          if (!stats) {
            reject(new Error(`Failed to stat remote path '${path}'`));
            return;
          }
          resolve(stats);
        });
      });
    },
    readdir(path) {
      return new Promise<RemoteDirEntryLike[]>((resolve, reject) => {
        sftp.readdir(path, (error, entries) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(entries ?? []);
        });
      });
    },
    mkdir(path) {
      return new Promise<void>((resolve, reject) => {
        sftp.mkdir(path, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    fastPut(localPath, remotePath) {
      return new Promise<void>((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    fastGet(remotePath, localPath) {
      return new Promise<void>((resolve, reject) => {
        sftp.fastGet(remotePath, localPath, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function normalizeSftpClient(sftp: SftpClientLike | RawSftpClient): SftpClientLike {
  return isWrappedSftpClient(sftp) ? sftp : wrapSftpClient(sftp);
}

function isWrappedSftpClient(sftp: SftpClientLike | RawSftpClient): sftp is SftpClientLike {
  return sftp.stat.length < 2;
}

function sanitizeLogText(text: string): string {
  return text
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[redacted-private-key]')
    .replace(/password=[^\s]+/gi, 'password=[redacted]');
}
