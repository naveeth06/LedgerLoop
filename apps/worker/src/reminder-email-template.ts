export interface ReminderEmailTemplateData {
  invoiceNumber: string;
  dueDate: string;
  outstandingPaise: string;
  reminderSequence: number;
}

export interface ReminderEmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface ReminderTone {
  subjectLabel: string;
  heading: string;
  intro: string;
  closing: string;
}

export function buildReminderEmailTemplate(data: ReminderEmailTemplateData): ReminderEmailTemplate {
  const invoiceNumber = requireNonEmpty(data.invoiceNumber, 'invoiceNumber');
  const dueDate = validateDate(data.dueDate);
  const amount = formatPaise(data.outstandingPaise);
  const reminderSequence = validateReminderSequence(data.reminderSequence);
  const tone = reminderTone(reminderSequence);
  const overdueDays = daysOverdue(dueDate);
  const overdueLabel = overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`;
  const subject = `${tone.subjectLabel}: invoice ${invoiceNumber}`;

  const text = [
    tone.heading,
    '',
    tone.intro,
    '',
    `Invoice: ${invoiceNumber}`,
    `Due date: ${dueDate}`,
    `Status: ${overdueLabel}`,
    `Outstanding amount: ${amount}`,
    '',
    tone.closing,
    '',
    'This is an automated message from LedgerLoop.',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#1f2937;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(tone.intro)}</div>`,
    '<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">',
    '<div style="padding:24px 24px 18px;border-bottom:1px solid #e5e7eb;">',
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">LedgerLoop</p>',
    `<h1 style="margin:0;font-size:24px;line-height:1.25;color:#111827;">${escapeHtml(tone.heading)}</h1>`,
    '</div>',
    '<div style="padding:24px;">',
    `<p style="margin:0 0 20px;">${escapeHtml(tone.intro)}</p>`,
    '<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;">',
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;">Invoice</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#111827;">${escapeHtml(invoiceNumber)}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;">Due date</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${escapeHtml(dueDate)}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#6b7280;">Status</td><td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${escapeHtml(overdueLabel)}</td></tr>`,
    `<tr><td style="padding:10px 0;color:#6b7280;">Outstanding</td><td style="padding:10px 0;text-align:right;font-size:18px;font-weight:700;color:#111827;">${escapeHtml(amount)}</td></tr>`,
    '</table>',
    `<p style="margin:0 0 20px;">${escapeHtml(tone.closing)}</p>`,
    '<p style="margin:0;color:#6b7280;font-size:13px;">This is an automated message from LedgerLoop.</p>',
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  return { subject, text, html };
}

function reminderTone(sequence: number): ReminderTone {
  if (sequence === 1) {
    return {
      subjectLabel: 'Payment reminder',
      heading: 'Payment reminder',
      intro: 'Our records show that the invoice below is still outstanding. Please review the details and arrange payment when convenient.',
      closing: 'If payment has already been made, no further action is needed. If you need to discuss the invoice, please contact the sender directly.',
    };
  }

  if (sequence === 2) {
    return {
      subjectLabel: 'Payment reminder #2',
      heading: 'Payment follow-up',
      intro: 'This is a follow-up regarding the outstanding invoice below. We would appreciate your review and payment at the earliest opportunity.',
      closing: 'If payment has already been made, please disregard this reminder. For any invoice questions, please contact the sender directly.',
    };
  }

  return {
    subjectLabel: `Payment reminder #${sequence}`,
    heading: 'Payment reminder',
    intro: 'The invoice below remains outstanding after previous reminders. Please review the balance and arrange payment or contact the sender if you need to discuss it.',
    closing: 'If payment has already been made, please disregard this reminder. If there is an issue with the invoice, please contact the sender directly so it can be reviewed.',
  };
}

export function formatPaise(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('outstandingPaise must be a non-negative integer string');
  const paise = BigInt(value);
  const rupees = paise / 100n;
  const fraction = (paise % 100n).toString().padStart(2, '0');
  return `₹${formatIndianInteger(rupees.toString())}.${fraction}`;
}

function validateReminderSequence(value: number): number {
  if (!Number.isInteger(value) || value < 1) throw new Error('reminderSequence must be a positive integer');
  return value;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
}

function validateDate(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) throw new Error('dueDate must use YYYY-MM-DD format');
  const [year, month, day] = trimmed.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('dueDate must be a valid calendar date');
  }
  return trimmed;
}

function daysOverdue(dueDate: string): number {
  const today = new Date();
  const due = new Date(`${dueDate}T00:00:00Z`);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dueUtc = due.getTime();
  return Math.max(0, Math.floor((todayUtc - dueUtc) / 86_400_000));
}

function formatIndianInteger(value: string): string {
  if (value.length <= 3) return value;
  if (value.length <= 5) return `${value.slice(0, -3)},${value.slice(-3)}`;

  const lastThree = value.slice(-3);
  let remaining = value.slice(0, -3);
  const groups: string[] = [];

  while (remaining.length > 2) {
    groups.unshift(remaining.slice(-2));
    remaining = remaining.slice(0, -2);
  }

  if (remaining) groups.unshift(remaining);
  return `${groups.join(',')},${lastThree}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\"': '&quot;',
    "'": '&#39;',
  }[character] ?? character));
}
