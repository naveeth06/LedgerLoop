import { describe, expect, it } from 'vitest';
import { buildReminderEmailTemplate, formatPaise } from './reminder-email-template';

describe('formatPaise', () => {
  it('formats integer paise as Indian rupees', () => {
    expect(formatPaise('123456789')).toBe('₹1,234,567.89');
    expect(formatPaise('0')).toBe('₹0.00');
  });

  it('rejects non-integer monetary values', () => {
    expect(() => formatPaise('12.50')).toThrow('outstandingPaise must be a non-negative integer string');
    expect(() => formatPaise('-1')).toThrow('outstandingPaise must be a non-negative integer string');
  });
});

describe('buildReminderEmailTemplate', () => {
  it('builds text and html content without exposing raw html', () => {
    const template = buildReminderEmailTemplate({
      invoiceNumber: 'INV-<42>',
      dueDate: '2026-10-15',
      outstandingPaise: '125050',
      reminderSequence: 2,
    });

    expect(template.subject).toBe('Payment reminder: invoice INV-<42>');
    expect(template.text).toContain('Outstanding amount: ₹1,250.50');
    expect(template.text).toContain('payment reminder #2');
    expect(template.html).toContain('INV-&lt;42&gt;');
    expect(template.html).toContain('₹1,250.50');
    expect(template.html).not.toContain('<42>');
  });

  it('uses the first-reminder label for sequence one', () => {
    const template = buildReminderEmailTemplate({
      invoiceNumber: 'INV-1',
      dueDate: '2026-10-15',
      outstandingPaise: '100',
      reminderSequence: 1,
    });

    expect(template.text).toContain('payment reminder.');
    expect(template.text).not.toContain('payment reminder #1');
  });
});
