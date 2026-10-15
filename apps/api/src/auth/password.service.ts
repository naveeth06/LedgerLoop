import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { z } from 'zod';

const passwordSchema = z.string().min(12).max(128);
const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const value = passwordSchema.parse(password);
    return argon2.hash(value, argonOptions);
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return false;
    if (typeof encodedHash !== 'string' || !encodedHash.startsWith('$argon2id$')) {
      // Burn a comparable Argon2id cost for unknown users or accounts without a password.
      await argon2.hash(parsed.data, argonOptions);
      return false;
    }
    try {
      return await argon2.verify(encodedHash, parsed.data);
    } catch {
      await argon2.hash(parsed.data, argonOptions);
      return false;
    }
  }
}
