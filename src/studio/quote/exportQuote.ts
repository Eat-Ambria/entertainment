/**
 * Quotation download — PDF (pdfmake), built from the saved snapshot (QuoteDocumentData,
 * so nothing internal can leak). The library is large, so it is loaded only when the user
 * clicks Download. The builder is pure for testing.
 */
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatPhone } from '@/lib/phone';
import { formatQty } from '@/lib/numbers';
import { BRAND } from '@/lib/brand';
import type { QuoteDocumentData } from './documentData';

export interface ExportBrand {
  name: string;
  contact: string | null;
}

export function exportBrand(profile: { business_name: string | null; contact_line: string | null } | null | undefined): ExportBrand {
  return {
    name: profile?.business_name?.trim() || `${BRAND.name} ${BRAND.product}`,
    contact: profile?.contact_line?.trim() || null,
  };
}

/** "ENT-2026-00007_Mehta-Family.pdf" — safe on every OS. */
export function quoteFileName(data: Pick<QuoteDocumentData, 'quoteNo' | 'guestName'>, ext: 'pdf'): string {
  const guest = data.guestName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return `${[data.quoteNo ?? 'Quotation', guest].filter(Boolean).join('_')}.${ext}`;
}

const eventLine = (d: QuoteDocumentData) => [d.eventDate && formatDate(d.eventDate), d.sessionName].filter(Boolean).join(' · ');
const venueLine = (d: QuoteDocumentData) => [d.venueName, d.subVenueName].filter(Boolean).join(' · ');

const INK = '#0f172a';
const MUTED = '#64748b';
const RULE = '#e7e5e4';
const ACCENT = '#946f30'; // brand-600 (champagne, readable on white)

/** Pure: the pdfmake document definition. */
export function pdfDefinition(d: QuoteDocumentData, brand: ExportBrand): TDocumentDefinitions {
  const sections = d.sections.map((sec): Content => ({
    stack: [
      {
        columns: [
          { text: sec.name, style: 'section' },
          sec.tier ? { text: sec.tier, color: ACCENT, bold: true, fontSize: 9, alignment: 'right', width: 'auto', margin: [0, 3, 0, 0] } : { text: '' },
        ],
        margin: [0, 16, 0, 6],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 70, 80, 85],
          body: [
            [
              { text: 'ELEMENT', style: 'th' },
              { text: 'QTY', style: 'th', alignment: 'right' },
              { text: 'RATE', style: 'th', alignment: 'right' },
              { text: 'AMOUNT', style: 'th', alignment: 'right' },
            ],
            ...sec.items.map((i) => [
              i.remarks ? { stack: [{ text: i.name }, { text: i.remarks, fontSize: 8, color: MUTED, italics: true }] } : { text: i.name },
              { text: formatQty(i.qty, i.unit), alignment: 'right' as const, color: MUTED },
              { text: formatINR(i.rate), alignment: 'right' as const, color: MUTED },
              { text: formatINR(i.amount), alignment: 'right' as const, bold: true },
            ]),
            ...(d.sections.length > 1
              ? [
                  [
                    { text: `${sec.name} subtotal`, colSpan: 3, alignment: 'right' as const, color: MUTED },
                    {},
                    {},
                    { text: formatINR(sec.subtotal), alignment: 'right' as const, bold: true },
                  ],
                ]
              : []),
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => RULE,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          paddingLeft: () => 0,
          paddingRight: (i: number) => (i === 3 ? 0 : 8),
        },
      },
    ],
  }));

  const charges: Content[] = d.charges.length
    ? [
        { text: 'ADDITIONAL CHARGES', style: 'th', margin: [0, 18, 0, 4] },
        {
          table: {
            widths: ['*', 85],
            body: d.charges.map((c) => [{ text: c.description }, { text: formatINR(c.amount), alignment: 'right' as const, bold: true }]),
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
            vLineWidth: () => 0,
            hLineColor: () => RULE,
            paddingTop: () => 5,
            paddingBottom: () => 5,
            paddingLeft: () => 0,
            paddingRight: () => 0,
          },
        },
      ]
    : [];

  const totalRow = (label: string, value: number, strong = false) => ({
    columns: [
      { text: label, color: strong ? INK : MUTED, bold: strong },
      { text: formatINR(value), alignment: 'right' as const, bold: strong, fontSize: strong ? 14 : 10, width: 110 },
    ],
    margin: [0, 3, 0, 3] as [number, number, number, number],
  });

  return {
    info: { title: `Quotation ${d.quoteNo ?? ''}`.trim(), author: brand.name },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: INK, lineHeight: 1.2 },
    styles: {
      brand: { fontSize: 16, bold: true },
      title: { fontSize: 20, bold: true, alignment: 'right' },
      label: { fontSize: 8, bold: true, color: '#94a3b8', characterSpacing: 0.8 },
      section: { fontSize: 13, bold: true },
      th: { fontSize: 8, bold: true, color: MUTED, characterSpacing: 0.6 },
    },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: 'All amounts in Indian Rupees (₹).', color: '#94a3b8', fontSize: 8 },
        { text: `Page ${page} of ${pages}`, alignment: 'right', color: '#94a3b8', fontSize: 8 },
      ],
      margin: [40, 16, 40, 0],
    }),
    content: [
      {
        columns: [
          { stack: [{ text: brand.name, style: 'brand' }, ...(brand.contact ? [{ text: brand.contact, color: MUTED, fontSize: 9, margin: [0, 3, 0, 0] as [number, number, number, number] }] : [])] },
          {
            stack: [
              { text: 'Quotation', style: 'title' },
              { text: d.quoteNo ?? '', alignment: 'right', color: MUTED },
              { text: formatDate(d.date), alignment: 'right', color: MUTED },
            ],
            width: 'auto',
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 14, 0, 14] },
      {
        columns: [
          {
            stack: [
              { text: 'PREPARED FOR', style: 'label' },
              { text: d.guestName, bold: true, margin: [0, 4, 0, 0] },
              ...(d.phone ? [{ text: `+91 ${formatPhone(d.phone)}`, color: MUTED }] : []),
            ],
          },
          {
            stack: [
              { text: 'EVENT', style: 'label' },
              { text: d.functionName, bold: true, margin: [0, 4, 0, 0] },
              ...(eventLine(d) ? [{ text: eventLine(d), color: MUTED }] : []),
              ...(venueLine(d) ? [{ text: venueLine(d), color: MUTED }] : []),
            ],
          },
        ],
      },
      ...sections,
      ...charges,
      {
        margin: [280, 18, 0, 0],
        stack: [
          totalRow('Elements subtotal', d.subtotal),
          totalRow('Additional charges', d.chargesTotal),
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 235, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 4, 0, 4] },
          totalRow('Total', d.total, true),
        ],
      },
    ],
  };
}

const defaultOf = <T>(m: T | { default: T }): T => ((m as { default?: T }).default ?? m) as T;

export async function downloadPdf(d: QuoteDocumentData, brand: ExportBrand): Promise<void> {
  const [pdfMake, vfs] = await Promise.all([
    import('pdfmake/build/pdfmake').then(defaultOf),
    import('pdfmake/build/vfs_fonts').then(defaultOf),
  ]);
  pdfMake.addVirtualFileSystem(vfs); // Roboto (has the ₹ glyph) is pdfmake's default font
  await pdfMake.createPdf(pdfDefinition(d, brand)).download(quoteFileName(d, 'pdf'));
}
