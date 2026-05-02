import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

import { CLIError } from '../errors.js';
import { defaultHostStore } from '../services/host-store.js';
import { createDaemonSessionRepository } from './daemon.js';
import { createAttachSession, readSessionLogs } from './io.js';
import { readPackageVersion, resolveExecutableName } from './formatting.js';
import { parseCliArgs } from './parse.js';
import { runCliCommand } from './run.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolvePath(currentDir, '..', '..', 'package.json');

export async function runCli(argv: string[]): Promise<number> {
  const packageVersion = await readPackageVersion(packageJsonPath);
  const executableName = resolveExecutableName(process.argv[1]);
  const parsed = parseCliArgs(argv);
  const sessionRepository = createDaemonSessionRepository();

  return runCliCommand(parsed, {
    hostStore: defaultHostStore,
    sessionService: sessionRepository,
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    packageVersion,
    executableName,
    readLogs: readSessionLogs,
    attachSession: createAttachSession({
      hostStore: defaultHostStore,
      sessionService: sessionRepository,
      env: process.env,
    }),
  });
}

export async function runCliMain(argv = process.argv.slice(2)): Promise<void> {
  try {
    const exitCode = await runCli(argv);
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof CLIError || error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
