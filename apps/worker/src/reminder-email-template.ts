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

export function buildReminderEmailTemplate(data: ReminderEmailTemplateData): ReminderEmailTemplate {
  const invoiceNumber = data.invoiceNumber.trim();
  const dueDate = data.dueDate.trim();
  const amount = formatPaise(data.outstandingPaise);
  const reminderLabel = data.reminderSequence === 1 ? 'payment reminder' : `payment reminder #${data.reminderSequence}`;
  const subject = `Payment reminder: invoice ${invoiceNumber}`;

  const text = [
    `Payment reminder for invoice ${invoiceNumber}`,
    '',
    `This is a ${reminderLabel}.`,
    `Due date: ${dueDate}`,
    `Outstanding amount: ${amount}`,
    '',
    'Please review the outstanding invoice and arrange payment at your earliest convenience.',
    '',
    'This is an automated message from LedgerLoop.',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<body style="margin:0;padding:24px;font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;background:#f8fafc;">',
    '<div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">',
    `<h2 style="margin:0 0 16px;">Payment reminder</h2>`,
    `<p style="margin:0 0 16px;">This is a ${escapeHtml(reminderLabel)} for invoice <strong>${escapeHtml(invoiceNumber)}</strong>.</p>`,
    '<table style="width:100%;border-collapse:collapse;margin:0 0 20px;">',
    `<tr><td style="padding:8px 0;color:#6b7280;">Invoice</td><td style="padding:8px 0;text-align:right;"><strong>${escapeHtml(invoiceNumber)}</strong></td></tr>`,
    `<tr><td style="padding:8px 0;color:#6b7280;">Due date</td><td style="padding:8px 0;text-align:right;">${escapeHtml(dueDate)}</td></tr>`,
    `<tr><td style="padding:8px 0;color:#6b7280;">Outstanding</td><td style="padding:8px 0;text-align:right;"><strong>${escapeHtml(amount)}</strong></td></tr>`,
    '</table>',
    '<p style="margin:0 0 16px;">Please review the outstanding invoice and arrange payment at your earliest convenience.</p>',
    '<p style="margin:0;color:#6b7280;font-size:13px;">This is an automated message from LedgerLoop.</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');

  return { subject, text, html };
}

export function formatPaise(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('outstandingPaise must be a non-negative integer string');
  const paise = BigInt(value);
  const rupees = paise / 100n;
  const fraction = (paise % 100n).toString().padStart(2, '0');
  return `₹${formatIndianInteger(rupees.toString())}.${fraction}`;
}

function formatIndianInteger(value: string): string {
  if (value.length <= 3) return value;
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
