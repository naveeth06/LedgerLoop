import { describe, expect, it } from 'vitest';
import { buildSmtpConfig } from './email-provider';

describe('buildSmtpConfig', () => {
  it('builds a secure SMTP configuration', () => {
    expect(buildSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'secret',
      REMINDER_FROM_EMAIL: 'accounts@example.com',
    })).toEqual({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      user: 'mailer',
      password: 'secret',
      from: 'accounts@example.com',
    });
  });

  it('rejects missing provider configuration', () => {
    expect(() => buildSmtpConfig({})).toThrow('SMTP_HOST is required');
  });

  it('rejects an invalid SMTP port', () => {
    expect(() => buildSmtpConfig({
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '99999',
      REMINDER_FROM_EMAIL: 'accounts@example.com',
    })).toThrow('SMTP_PORT must be a valid TCP port');
  });
});
