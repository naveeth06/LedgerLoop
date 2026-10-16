import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReminderEmailTemplate, formatPaise } from './reminder-email-template';

afterEach(() => {
  vi.useRealTimers();
});

describe('formatPaise', () => {
  it('formats integer paise as Indian rupees', () => {
    expect(formatPaise('123456789')).toBe('₹12,34,567.89');
    expect(formatPaise('1234567890')).toBe('₹1,23,45,678.90');
    expect(formatPaise('0')).toBe('₹0.00');
  });

  it('rejects non-integer monetary values', () => {
    expect(() => formatPaise('12.50')).toThrow('outstandingPaise must be a non-negative integer string');
    expect(() => formatPaise('-1')).toThrow('outstandingPaise must be a non-negative integer string');
  });
});

describe('buildReminderEmailTemplate', () => {
  it('builds accessible text and escaped html content', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));

    const template = buildReminderEmailTemplate({
      invoiceNumber: 'INV-<42>',
      dueDate: '2026-10-15',
      outstandingPaise: '125050',
      reminderSequence: 2,
    });

    expect(template.subject).toBe('Payment reminder #2: invoice INV-<42>');
    expect(template.text).toContain('Payment follow-up');
    expect(template.text).toContain('Status: 1 day overdue');
    expect(template.text).toContain('Outstanding amount: ₹1,250.50');
    expect(template.html).toContain('INV-&lt;42&gt;');
    expect(template.html).toContain('₹1,250.50');
    expect(template.html).toContain('role="presentation"');
    expect(template.html).not.toContain('<42>');
  });

  it('uses a friendly first-reminder tone', () => {
    const template = buildReminderEmailTemplate({
      invoiceNumber: 'INV-1',
      dueDate: '2026-10-15',
      outstandingPaise: '100',
      reminderSequence: 1,
    });

    expect(template.subject).toBe('Payment reminder: invoice INV-1');
    expect(template.text).toContain('Our records show that the invoice below is still outstanding.');
    expect(template.text).not.toContain('Payment follow-up');
  });

  it('uses the escalation tone for later reminders without threatening language', () => {
    const template = buildReminderEmailTemplate({
      invoiceNumber: 'INV-3',
      dueDate: '2026-10-15',
      outstandingPaise: '100',
      reminderSequence: 3,
    });

    expect(template.subject).toBe('Payment reminder #3: invoice INV-3');
    expect(template.text).toContain('after previous reminders');
    expect(template.text).not.toMatch(/legal action|penalty|collection agency/i);
  });

  it('rejects invalid template inputs', () => {
    expect(() => buildReminderEmailTemplate({ invoiceNumber: ' ', dueDate: '2026-10-15', outstandingPaise: '100', reminderSequence: 1 }))
      .toThrow('invoiceNumber must not be empty');
    expect(() => buildReminderEmailTemplate({ invoiceNumber: 'INV-1', dueDate: '2026-02-30', outstandingPaise: '100', reminderSequence: 1 }))
      .toThrow('dueDate must be a valid calendar date');
    expect(() => buildReminderEmailTemplate({ invoiceNumber: 'INV-1', dueDate: '2026-10-15', outstandingPaise: '100', reminderSequence: 0 }))
      .toThrow('reminderSequence must be a positive integer');
  });
});
