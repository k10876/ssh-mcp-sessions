import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';

import {
  HostNotFoundError,
  HostStoreError,
  SessionBusyError,
  SessionError,
  SessionExistsError,
  SessionNotFoundError,
  ValidationError,
} from '../src/errors.js';
import { toMcpError } from '../src/index.js';

describe('toMcpError', () => {
  it('passes through existing McpError instances', () => {
    const error = new McpError(ErrorCode.InvalidRequest, 'already mapped');

    expect(toMcpError(error)).toBe(error);
  });

  it('maps validation and missing-resource errors to invalid params', () => {
    expect(toMcpError(new ValidationError('bad input')).code).toBe(ErrorCode.InvalidParams);
    expect(toMcpError(new HostNotFoundError('missing host')).code).toBe(ErrorCode.InvalidParams);
    expect(toMcpError(new SessionNotFoundError('missing session')).code).toBe(ErrorCode.InvalidParams);
  });

  it('maps duplicate and busy session errors to invalid request', () => {
    expect(toMcpError(new SessionExistsError('duplicate')).code).toBe(ErrorCode.InvalidRequest);
    expect(toMcpError(new SessionBusyError('busy')).code).toBe(ErrorCode.InvalidRequest);
  });

  it('maps backend failures to internal error', () => {
    expect(toMcpError(new HostStoreError('store failed')).code).toBe(ErrorCode.InternalError);
    expect(toMcpError(new SessionError('session failed')).code).toBe(ErrorCode.InternalError);
  });

  it('maps unknown errors to internal error with their message', () => {
    const mapped = toMcpError(new Error('unexpected failure'));

    expect(mapped.code).toBe(ErrorCode.InternalError);
    expect(mapped.message).toContain('unexpected failure');
  });
});
