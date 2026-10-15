import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { z } from 'zod';

const passwordSchema = z.string().min(12).max(128);

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const value = passwordSchema.parse(password);
    return argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success || !encodedHash.startsWith('$argon2id$')) return false;
    try {
      return await argon2.verify(encodedHash, parsed.data);
    } catch {
      return false;
    }
  }
}
