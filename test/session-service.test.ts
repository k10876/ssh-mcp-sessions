import { describe, expect, it } from 'vitest';

import { SessionError, SessionNotFoundError } from '../src/errors.js';
import { SessionService } from '../src/services/session-service.js';

describe('session service', () => {
  it('requires named sessions before connecting', async () => {
    const service = new SessionService(1000);

    await expect(
      service.startSession('   ', {
        host: 'example.com',
        port: 22,
        username: 'alice',
      }),
    ).rejects.toBeInstanceOf(SessionError);
  });

  it('reports missing sessions for lookup operations', async () => {
    const service = new SessionService(1000);

    expect(() => service.getSessionInfo('missing')).toThrow(SessionNotFoundError);
    await expect(service.execute('missing', 'pwd')).rejects.toBeInstanceOf(SessionNotFoundError);
    await expect(service.closeSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('lists no sessions initially', () => {
    const service = new SessionService(1000);

    expect(service.listSessions()).toEqual([]);
    expect(service.hasSession('missing')).toBe(false);
  });
});
