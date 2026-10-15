import nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
}

export interface EmailSendResult { providerMessageId?: string; }
export interface EmailProvider { send(message: EmailMessage): Promise<EmailSendResult>; }
export interface SmtpConfig { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; }

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  constructor(private readonly config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const result = await this.transport.sendMail({
      from: this.config.from, to: message.to, subject: message.subject, text: message.text, html: message.html, messageId: message.messageId,
    });
    return { providerMessageId: result.messageId };
  }
}

export function buildSmtpConfig(environment: NodeJS.ProcessEnv): SmtpConfig {
  const host = required(environment.SMTP_HOST, 'SMTP_HOST');
  const from = required(environment.REMINDER_FROM_EMAIL, 'REMINDER_FROM_EMAIL');
  const port = parsePort(environment.SMTP_PORT ?? '587');
  const secure = (environment.SMTP_SECURE ?? 'false') === 'true';
  if (environment.SMTP_SECURE !== undefined && environment.SMTP_SECURE !== 'true' && environment.SMTP_SECURE !== 'false') throw new Error('SMTP_SECURE must be true or false');
  return { host, port, secure, user: environment.SMTP_USER || undefined, password: environment.SMTP_PASSWORD || undefined, from };
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required for reminder email delivery`);
  return value.trim();
}
function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid TCP port');
  return port;
}
