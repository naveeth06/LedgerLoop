import { describe, expect, it } from 'vitest';
import { SalesGstService } from './sales-gst.service';

describe('SalesGstService', () => {
  const service = new SalesGstService();

  it('calculates intra-state CGST and SGST with integer paise rounding', () => {
    const result = service.calculate([
      { quantity: '1.5', unitPricePaise: '101', discountPaise: '1', gstRateBps: 1800 },
    ], '33', '33');

    expect(result.subtotalPaise).toBe('152');
    expect(result.discountPaise).toBe('1');
    expect(result.taxablePaise).toBe('151');
    expect(result.cgstPaise).toBe('14');
    expect(result.sgstPaise).toBe('14');
    expect(result.igstPaise).toBe('0');
    expect(result.totalPaise).toBe('179');
  });

  it('calculates interstate IGST instead of CGST and SGST', () => {
    const result = service.calculate([
      { quantity: '2', unitPricePaise: '10000', gstRateBps: 1200 },
    ], '33', '29');

    expect(result.cgstPaise).toBe('0');
    expect(result.sgstPaise).toBe('0');
    expect(result.igstPaise).toBe('2400');
    expect(result.totalPaise).toBe('22400');
  });

  it('rejects a discount greater than the line subtotal', () => {
    expect(() => service.calculate([
      { quantity: '1', unitPricePaise: '100', discountPaise: '101', gstRateBps: 0 },
    ], '33', '33')).toThrow('discount cannot exceed');
  });
});
