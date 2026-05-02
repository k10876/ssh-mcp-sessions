#!/usr/bin/env node

import { runCliMain } from './cli/index.js';
import { startSessionDaemon } from './cli/daemon.js';
import { defaultSessionService } from './services/session-service.js';

async function main(): Promise<void> {
  if (process.argv[2] === 'daemon') {
    await startSessionDaemon({ sessionService: defaultSessionService });
    return new Promise(() => undefined);
  }

  await runCliMain();
}

if (process.env.SSH_CLI_DISABLE_MAIN !== '1') {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}
