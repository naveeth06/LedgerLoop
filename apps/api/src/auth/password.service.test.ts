import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  it('hashes passwords with Argon2id and verifies the original password', async () => {
    const service = new PasswordService();
    const hash = await service.hash('a-long-password-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify('a-long-password-123', hash)).resolves.toBe(true);
    await expect(service.verify('a-long-password-124', hash)).resolves.toBe(false);
  });

  it('rejects weak passwords and malformed hashes safely', async () => {
    const service = new PasswordService();
    await expect(service.hash('short')).rejects.toThrow();
    await expect(service.verify('short', 'not-a-hash')).resolves.toBe(false);
  });
});
