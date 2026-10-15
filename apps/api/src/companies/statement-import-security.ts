import { BadRequestException } from '@nestjs/common';

const unsafeControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function assertSafeStatementText(value: string, fieldName: string): string {
  if (unsafeControlCharacterPattern.test(value)) {
    throw new BadRequestException(`${fieldName} contains unsupported control characters.`);
  }
  return value;
}
