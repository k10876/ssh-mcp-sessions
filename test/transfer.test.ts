import { describe, expect, it, vi } from 'vitest';

import { CLIError } from '../src/errors.js';
import { createTransferHandlers, type SftpClientLike, type TransferLogger, type TransferSshClientFactory } from '../src/cli/transfer.js';
import type { CliTransferOptions } from '../src/cli/types.js';

type DirEntry = { filename: string; attrs: { isDirectory: () => boolean } };

type CallbackSftpStats = { isDirectory: () => boolean };

type CallbackSftpClient = {
  stat(path: string, callback: (error: Error | undefined, stats?: CallbackSftpStats) => void): void;
  readdir(path: string, callback: (error: Error | undefined, entries?: DirEntry[]) => void): void;
  mkdir(path: string, callback: (error?: Error) => void): void;
  fastPut(localPath: string, remotePath: string, callback: (error?: Error) => void): void;
  fastGet(remotePath: string, localPath: string, callback: (error?: Error) => void): void;
};

function createHandlers(args: {
  sftp: SftpClientLike;
  logger?: TransferLogger;
  connect?: ReturnType<typeof vi.fn>;
}) {
  const end = vi.fn();
  const connect = args.connect ?? vi.fn(async () => ({ host: 'example.com', port: 22, username: 'alice' }));
  const clientFactory: TransferSshClientFactory = () => ({
    connect: vi.fn(async () => undefined),
    openSftp: vi.fn(async () => args.sftp),
    end,
  });

  const handlers = createTransferHandlers({
    getConnectConfig: connect,
    createClient: clientFactory,
    logger: args.logger,
  });

  return { ...handlers, end, connect };
}

describe('transfer handlers', () => {
  it('rejects uploading a directory without --recursive', async () => {
    const { putPath } = createHandlers({
      sftp: {
        stat: vi.fn(async () => ({ isDirectory: () => false })),
        lstat: vi.fn(async () => ({ isDirectory: () => false })),
        readdir: vi.fn(async () => []),
        mkdir: vi.fn(async () => undefined),
        fastPut: vi.fn(async () => undefined),
        fastGet: vi.fn(async () => undefined),
      },
    });

    await expect(
      putPath({
        host: 'dev',
        sourcePath: '/tmp/local-dir',
        destinationPath: '/remote/local-dir',
        recursive: false,
        statLocalPath: vi.fn(async () => ({ isDirectory: () => true })),
        readLocalDir: vi.fn(async () => []),
      }),
    ).rejects.toEqual(new CLIError("Local path '/tmp/local-dir' is a directory; rerun with --recursive"));
  });

  it('rejects downloading a directory without --recursive', async () => {
    const { getPath } = createHandlers({
      sftp: {
        stat: vi.fn(async () => ({ isDirectory: () => true })),
        lstat: vi.fn(async () => ({ isDirectory: () => true })),
        readdir: vi.fn(async () => []),
        mkdir: vi.fn(async () => undefined),
        fastPut: vi.fn(async () => undefined),
        fastGet: vi.fn(async () => undefined),
      },
    });

    await expect(
      getPath({
        host: 'dev',
        sourcePath: '/remote/data',
        destinationPath: '/tmp/data',
        recursive: false,
      }),
    ).rejects.toEqual(new CLIError("Remote path '/remote/data' is a directory; rerun with --recursive"));
  });

  it('supports callback-based ssh2 sftp clients when checking remote directories', async () => {
    const rawSftp: CallbackSftpClient = {
      stat: vi.fn((_, callback) => callback(undefined, { isDirectory: () => true })),
      readdir: vi.fn((_, callback) => callback(undefined, [])),
      mkdir: vi.fn((_, callback) => callback()),
      fastPut: vi.fn((_, __, callback) => callback()),
      fastGet: vi.fn((_, __, callback) => callback()),
    };

    const { getPath } = createHandlers({
      sftp: rawSftp as unknown as SftpClientLike,
    });

    await expect(
      getPath({
        host: 'dev',
        sourcePath: '/remote/data',
        destinationPath: '/tmp/data',
        recursive: false,
      }),
    ).rejects.toEqual(new CLIError("Remote path '/remote/data' is a directory; rerun with --recursive"));
  });

  it('uploads files recursively and logs the transfer', async () => {
    const logger = vi.fn(async () => undefined);
    const readLocalDir = vi.fn(async () => [
      { name: 'nested', parentPath: '/tmp/source', isDirectory: () => true },
      { name: 'file.txt', parentPath: '/tmp/source', isDirectory: () => false },
    ]);
    const statLocalPath = vi
      .fn<(...args: [string]) => Promise<{ isDirectory: () => boolean }>>()
      .mockImplementation(async (path) => ({ isDirectory: () => path === '/tmp/source' || path === '/tmp/source/nested' }));

    const fastPut = vi.fn(async () => undefined);
    const mkdir = vi.fn(async () => undefined);
    const { putPath, end } = createHandlers({
      logger,
      sftp: {
        stat: vi.fn(async () => ({ isDirectory: () => false })),
        lstat: vi.fn(async () => ({ isDirectory: () => false })),
        readdir: vi.fn(async () => []),
        mkdir,
        fastPut,
        fastGet: vi.fn(async () => undefined),
      },
    });

    const message = await putPath({
      host: 'dev',
      sourcePath: '/tmp/source',
      destinationPath: '/remote/source',
      recursive: true,
      statLocalPath,
      readLocalDir,
    });

    expect(mkdir).toHaveBeenCalledWith('/remote/source', true);
    expect(mkdir).toHaveBeenCalledWith('/remote/source/nested', true);
    expect(fastPut).toHaveBeenCalledWith('/tmp/source/file.txt', '/remote/source/file.txt');
    expect(logger).toHaveBeenCalledWith('dev', 'PUT_RECURSIVE from=/tmp/source to=/remote/source');
    expect(message).toBe("Uploaded 'dev:/tmp/source' to 'dev:/remote/source'");
    expect(end).toHaveBeenCalledOnce();
  });

  it('downloads files recursively', async () => {
    const remoteEntries = new Map<string, DirEntry[]>([
      [
        '/remote/source',
        [
          { filename: 'nested', attrs: { isDirectory: () => true } },
          { filename: 'file.txt', attrs: { isDirectory: () => false } },
        ],
      ],
      ['/remote/source/nested', []],
    ]);
    const fastGet = vi.fn(async () => undefined);
    const mkdirLocalDir = vi.fn(async () => undefined);
    const { getPath, end } = createHandlers({
      sftp: {
        stat: vi.fn(async (path: string) => ({ isDirectory: () => path === '/remote/source' || path === '/remote/source/nested' })),
        lstat: vi.fn(async (path: string) => ({ isDirectory: () => path === '/remote/source' || path === '/remote/source/nested' })),
        readdir: vi.fn(async (path: string) => remoteEntries.get(path) ?? []),
        mkdir: vi.fn(async () => undefined),
        fastPut: vi.fn(async () => undefined),
        fastGet,
      },
    });

    const message = await getPath({
      host: 'dev',
      sourcePath: '/remote/source',
      destinationPath: '/tmp/source',
      recursive: true,
      mkdirLocalDir,
    });

    expect(mkdirLocalDir).toHaveBeenCalledWith('/tmp/source');
    expect(mkdirLocalDir).toHaveBeenCalledWith('/tmp/source/nested');
    expect(fastGet).toHaveBeenCalledWith('/remote/source/file.txt', '/tmp/source/file.txt');
    expect(message).toBe("Downloaded 'dev:/remote/source' to '/tmp/source'");
    expect(end).toHaveBeenCalledOnce();
  });
});
