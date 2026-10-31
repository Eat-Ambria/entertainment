// @vitest-environment node
/**
 * Tests for the quotation PDF builder. It is rendered for real (pdfmake's Node build) to
 * prove the definition is valid, the ₹ text survives and no internal field can appear.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pdfmake from 'pdfmake';
import { exportBrand, pdfDefinition, quoteFileName } from './exportQuote';
import type { QuoteDocumentData } from './documentData';

const data: QuoteDocumentData = {
  quoteNo: 'ENT-2026-00007',
  status: 'draft',
  date: '2026-10-26T10:00:00Z',
  guestName: 'Mehta Family',
  phone: '9876543210',
  functionName: 'Sangeet',
  venueName: 'Ambria Exotica',
  subVenueName: 'The Aura',
  eventDate: '2027-01-10',
  sessionName: 'Dinner',
  sections: [
    {
      name: 'Royal Package',
      tier: 'Premium',
      items: [
        { name: 'Entrance Arch', unit: 'Nos', qty: 1, rate: 25000, amount: 25000 },
        { name: 'Sofa Lounge', remarks: 'Bride entry, Exotica lawn', unit: 'Set', qty: 3, rate: 14000, amount: 42000 },
      ],
      subtotal: 67000,
    },
    { name: 'Classic Package', tier: null, items: [{ name: 'DJ', unit: 'Hour', qty: 4, rate: 8000, amount: 32000 }], subtotal: 32000 },
  ],
  charges: [{ description: 'Transportation', amount: 5000 }],
  subtotal: 99000,
  chargesTotal: 5000,
  total: 104000,
};
const brand = { name: 'Ambria Entertainment', contact: '+91 98100 00000 · events@ambria.in' };

describe('quoteFileName', () => {
  it('uses the quote number and a file-safe guest name', () => {
    expect(quoteFileName(data, 'pdf')).toBe('ENT-2026-00007_Mehta-Family.pdf');
    expect(quoteFileName({ quoteNo: 'ENT-1', guestName: 'Rao / Sharma: "Big" day' }, 'pdf')).toBe('ENT-1_Rao-Sharma-Big-day.pdf');
    expect(quoteFileName({ quoteNo: null, guestName: '' }, 'pdf')).toBe('Quotation.pdf');
  });
});

describe('exportBrand', () => {
  it('uses the business profile, falling back to the default brand', () => {
    expect(exportBrand({ business_name: ' Rao Events ', contact_line: '' })).toEqual({ name: 'Rao Events', contact: null });
    expect(exportBrand(null).name).toBe('Ambria Entertainment');
  });
});

describe('pdfDefinition', () => {
  const json = JSON.stringify(pdfDefinition(data, brand));

  it('contains the guest, every package section, charges and totals', () => {
    for (const text of ['Mehta Family', 'Royal Package', 'Classic Package', 'Premium', 'Sofa Lounge', 'DJ', 'Transportation', 'Royal Package subtotal']) {
      expect(json).toContain(text);
    }
    expect(json).toContain('₹1,04,000.00');
    expect(json).toContain('Ambria Exotica · The Aura');
    expect(json).toContain(brand.contact);
    expect(json).toContain('Bride entry, Exotica lawn'); // element remarks under the name
  });

  it('has no section subtotal row when there is only one package', () => {
    const one = JSON.stringify(pdfDefinition({ ...data, sections: [data.sections[0]!] }, brand));
    expect(one).not.toContain('Royal Package subtotal');
  });

  it('renders to a real PDF', async () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../node_modules/pdfmake/build/fonts/Roboto');
    pdfmake.addFonts({
      Roboto: {
        normal: path.join(dir, 'Roboto-Regular.ttf'),
        bold: path.join(dir, 'Roboto-Medium.ttf'),
        italics: path.join(dir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(dir, 'Roboto-MediumItalic.ttf'),
      },
    });
    (pdfmake as unknown as { setLocalAccessPolicy(cb: () => boolean): void }).setLocalAccessPolicy(() => true);
    const buf: Buffer = await pdfmake.createPdf(pdfDefinition(data, brand)).getBuffer();
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(5000);
  }, 20000);
});

describe('guest-safe output', () => {
  it('never contains internal words in what the guest reads', () => {
    const pdfText = [...JSON.stringify(pdfDefinition(data, brand)).matchAll(/"text":"([^"]*)"/g)].map((m) => m[1]).join(' ');
    expect(pdfText).not.toMatch(/cost|vendor|margin|profit|multiplier/i);
  });
});
