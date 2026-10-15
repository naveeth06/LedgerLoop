import { BadRequestException, Injectable } from '@nestjs/common';

export interface SalesTaxLineInput {
  quantity: string;
  unitPricePaise: string;
  discountPaise?: string;
  gstRateBps: number;
}

export interface CalculatedSalesTaxLine {
  taxablePaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
}

export interface CalculatedSalesTax {
  subtotalPaise: string;
  discountPaise: string;
  taxablePaise: string;
  cgstPaise: string;
  sgstPaise: string;
  igstPaise: string;
  totalPaise: string;
  lines: CalculatedSalesTaxLine[];
}

const MICROS = 1_000_000n;
const BPS = 10_000n;
const MAX_PAise = 999_999_999_999_999_999n;

function quantityToMicros(quantity: string): bigint {
  const [whole, fraction = ''] = quantity.split('.');
  return BigInt(whole) * MICROS + BigInt(fraction.padEnd(6, '0'));
}

function multiplyQuantity(quantity: string, unitPricePaise: string): bigint {
  return (quantityToMicros(quantity) * BigInt(unitPricePaise) + 500_000n) / MICROS;
}

function taxFor(taxablePaise: bigint, gstRateBps: number): bigint {
  return (taxablePaise * BigInt(gstRateBps) + 5_000n) / BPS;
}

function assertMoney(value: bigint, field: string): void {
  if (value < 0n || value > MAX_PAise) throw new BadRequestException(`${field} exceeds the supported paise range.`);
}

@Injectable()
export class SalesGstService {
  calculate(lines: SalesTaxLineInput[], sellerStateCode: string, placeOfSupplyStateCode: string): CalculatedSalesTax {
    if (!/^[0-9]{2}$/.test(sellerStateCode) || !/^[0-9]{2}$/.test(placeOfSupplyStateCode)) {
      throw new BadRequestException('Seller and place-of-supply state codes must be two digits.');
    }
    if (lines.length < 1 || lines.length > 500) throw new BadRequestException('At least one and at most 500 sales lines are required.');

    const interstate = sellerStateCode !== placeOfSupplyStateCode;
    let subtotal = 0n;
    let discount = 0n;
    let taxable = 0n;
    let cgst = 0n;
    let sgst = 0n;
    let igst = 0n;

    const calculatedLines = lines.map((line, index) => {
      if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(line.quantity) || quantityToMicros(line.quantity) <= 0n) {
        throw new BadRequestException(`Line ${index + 1} quantity is invalid.`);
      }
      if (!/^(0|[1-9][0-9]{0,17})$/.test(line.unitPricePaise) || BigInt(line.unitPricePaise) < 0n) {
        throw new BadRequestException(`Line ${index + 1} unit price is invalid.`);
      }
      const discountPaise = line.discountPaise ?? '0';
      if (!/^(0|[1-9][0-9]{0,17})$/.test(discountPaise)) throw new BadRequestException(`Line ${index + 1} discount is invalid.`);
      if (!Number.isInteger(line.gstRateBps) || line.gstRateBps < 0 || line.gstRateBps > 10000) {
        throw new BadRequestException(`Line ${index + 1} GST rate is invalid.`);
      }

      const lineSubtotal = multiplyQuantity(line.quantity, line.unitPricePaise);
      const lineDiscount = BigInt(discountPaise);
      if (lineDiscount > lineSubtotal) throw new BadRequestException(`Line ${index + 1} discount cannot exceed its subtotal.`);
      const lineTaxable = lineSubtotal - lineDiscount;
      const lineTax = taxFor(lineTaxable, line.gstRateBps);
      const lineCgst = interstate ? 0n : lineTax / 2n;
      const lineSgst = interstate ? 0n : lineTax - lineCgst;
      const lineIgst = interstate ? lineTax : 0n;
      const lineTotal = lineTaxable + lineTax;

      assertMoney(lineSubtotal, `Line ${index + 1} subtotal`);
      assertMoney(lineTaxable, `Line ${index + 1} taxable value`);
      assertMoney(lineTax, `Line ${index + 1} GST`);
      assertMoney(lineTotal, `Line ${index + 1} total`);

      subtotal += lineSubtotal;
      discount += lineDiscount;
      taxable += lineTaxable;
      cgst += lineCgst;
      sgst += lineSgst;
      igst += lineIgst;

      return {
        taxablePaise: lineTaxable.toString(),
        cgstPaise: lineCgst.toString(),
        sgstPaise: lineSgst.toString(),
        igstPaise: lineIgst.toString(),
        totalPaise: lineTotal.toString(),
      };
    });

    const total = taxable + cgst + sgst + igst;
    [subtotal, discount, taxable, cgst, sgst, igst, total].forEach((value) => assertMoney(value, 'Sales document total'));

    return {
      subtotalPaise: subtotal.toString(),
      discountPaise: discount.toString(),
      taxablePaise: taxable.toString(),
      cgstPaise: cgst.toString(),
      sgstPaise: sgst.toString(),
      igstPaise: igst.toString(),
      totalPaise: total.toString(),
      lines: calculatedLines,
    };
  }
}
