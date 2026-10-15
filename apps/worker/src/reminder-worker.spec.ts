import { describe, expect, it } from 'vitest';
import { parseRedisUrl } from './reminder-worker';

describe('parseRedisUrl', () => {
  it('parses Redis connection settings', () => {
    expect(parseRedisUrl('redis://worker:secret@localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      username: 'worker',
      password: 'secret',
    });
  });

  it('enables TLS for rediss connections', () => {
    expect(parseRedisUrl('rediss://localhost:6380')).toEqual({
      host: 'localhost',
      port: 6380,
      username: undefined,
      password: undefined,
      tls: {},
    });
  });

  it('rejects unsupported protocols', () => {
    expect(() => parseRedisUrl('http://localhost:6379')).toThrow('REDIS_URL must use redis:// or rediss://');
  });
});
