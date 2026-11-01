/**
 * Quotation download — PDF (pdfmake), built from the saved snapshot (QuoteDocumentData,
 * so nothing internal can leak). It looks exactly like the on-screen quotation after saving
 * (QuoteDocument), with the Ambria mark and Fraunces + Inter. The library, fonts and logo are
 * loaded only when the user clicks Download. The builder is pure for testing.
 */
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatPhone } from '@/lib/phone';
import { formatQty } from '@/lib/numbers';
import { BRAND } from '@/lib/brand';
import { asset } from '@/lib/asset';
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

// Same colours as the on-screen quotation (QuoteDocument): white paper, slate text, stone rules.
const INK = '#0f172a'; // slate-900
const BODY = '#1e293b'; // slate-800
const MUTED = '#64748b'; // slate-500
const FAINT = '#94a3b8'; // slate-400
const RULE = '#e7e5e4'; // stone-200
const RULE_SOFT = '#f5f5f4'; // stone-100
const CHIP_BG = '#f5f5f4'; // stone-100
const CHIP_TEXT = '#57534e'; // stone-600
const BRAND_50 = '#fdf8ec';
const BRAND_700 = '#7a5a25';

const CONTENT_W = 515; // A4 width minus 40pt margins
/** [left, top, right, bottom] margin tuple (pdfmake needs a fixed-length tuple type). */
const mg = (l: number, t: number, r: number, b: number): [number, number, number, number] => [l, t, r, b];

const STATUS_LABEL: Record<QuoteDocumentData['status'], string> = { draft: 'Draft', sent: 'Sent', confirmed: 'Confirmed', cancelled: 'Cancelled' };

/** A small rounded-looking chip (pdfmake tables can't round corners; padding keeps it soft). */
const chip = (text: string, bg: string, color: string, bold = false): Content => ({
  table: { body: [[{ text, fontSize: 8, bold, color, margin: mg(7, 1, 7, 1) }]] },
  layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => bg, paddingTop: () => 2, paddingBottom: () => 2 },
});
const rightAligned = (c: Content, margin = mg(0, 0, 0, 0)): Content => ({ columns: [{ text: '', width: '*' }, { width: 'auto', stack: [c] }], margin });
const rule = (margin: [number, number, number, number]): Content => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.75, lineColor: RULE }], margin });

/**
 * Pure: the pdfmake document definition — a print of the on-screen quotation (QuoteDocument):
 * brand mark + name + "ENTERTAINMENT", "Quotation", number, date, status chip; Prepared for /
 * Event; one table per package (tier chip, subtotal when several); charges (older quotes only);
 * totals; "All amounts in Indian Rupees (₹)." Fonts: Fraunces (brand name) + Inter, registered in
 * downloadPdf. `logo` is a PNG data URL (or a file path in tests).
 */
export function pdfDefinition(d: QuoteDocumentData, brand: ExportBrand, logo?: string): TDocumentDefinitions {
  const sections = d.sections.map((sec): Content => ({
    stack: [
      {
        columns: [
          { text: sec.name, fontSize: 13, bold: true, color: INK, width: '*' },
          ...(sec.tier ? [{ width: 'auto' as const, stack: [chip(sec.tier, BRAND_50, BRAND_700, true)] }] : []),
        ],
        margin: mg(0, 18, 0, 8),
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
              i.remarks ? { stack: [{ text: i.name, color: BODY }, { text: i.remarks, fontSize: 8, color: MUTED, italics: true }] } : { text: i.name, color: BODY },
              { text: formatQty(i.qty, i.unit), alignment: 'right' as const, color: '#475569' },
              { text: formatINR(i.rate), alignment: 'right' as const, color: '#475569' },
              { text: formatINR(i.amount), alignment: 'right' as const, bold: true, color: INK },
            ]),
            ...(d.sections.length > 1
              ? [
                  [
                    { text: `${sec.name} subtotal`, colSpan: 3, alignment: 'right' as const, color: MUTED },
                    {},
                    {},
                    { text: formatINR(sec.subtotal), alignment: 'right' as const, bold: true, color: INK },
                  ],
                ]
              : []),
          ],
        },
        layout: {
          // border-y on the header, soft dividers between rows, a full rule above the subtotal.
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || (d.sections.length > 1 && i === node.table.body.length - 1) ? 0.75 : i === node.table.body.length ? 0 : 0.6),
          hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i <= 1 || (d.sections.length > 1 && i === node.table.body.length - 1) ? RULE : RULE_SOFT),
          vLineWidth: () => 0,
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: (i: number) => (i === 0 ? 0 : 8),
          paddingRight: (i: number) => (i === 3 ? 0 : 8),
        },
      },
    ],
  }));

  const charges: Content[] = d.charges.length
    ? [
        { text: 'ADDITIONAL CHARGES', style: 'th', margin: mg(0, 18, 0, 4) },
        {
          table: {
            widths: ['*', 85],
            body: d.charges.map((c) => [{ text: c.description, color: BODY }, { text: formatINR(c.amount), alignment: 'right' as const, bold: true }]),
          },
          layout: {
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
            hLineColor: () => RULE_SOFT,
            vLineWidth: () => 0,
            paddingTop: () => 6,
            paddingBottom: () => 6,
            paddingLeft: () => 0,
            paddingRight: () => 0,
          },
        },
      ]
    : [];

  const totalRow = (label: string, value: number) => ({
    columns: [
      { text: label, color: MUTED },
      { text: formatINR(value), alignment: 'right' as const, color: INK, width: 120 },
    ],
    margin: mg(0, 3, 0, 3),
  });

  return {
    info: { title: `Quotation ${d.quoteNo ?? ''}`.trim(), author: brand.name },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    ...(logo ? { images: { logo } } : {}),
    defaultStyle: { font: 'Inter', fontSize: 9.5, color: INK, lineHeight: 1.25 },
    styles: {
      label: { fontSize: 7.5, bold: true, color: FAINT, characterSpacing: 0.9 },
      th: { fontSize: 7.5, bold: true, color: MUTED, characterSpacing: 0.9 },
    },
    footer: (page: number, pages: number) =>
      pages > 1 ? { text: `Page ${page} of ${pages}`, alignment: 'right', color: FAINT, fontSize: 7.5, margin: mg(40, 18, 40, 0) } : null,
    content: [
      // Header: brand on the left, "Quotation" block on the right.
      {
        columns: [
          {
            width: '*',
            stack: [
              {
                columns: [
                  ...(logo ? [{ image: 'logo', width: 40, height: 40 }, { text: '', width: 10 }] : []),
                  {
                    width: '*',
                    stack: [
                      { text: brand.name, font: 'Fraunces', fontSize: 16, color: INK, margin: mg(0, logo ? 4 : 0, 0, 0) },
                      { text: 'ENTERTAINMENT', fontSize: 7.5, color: BRAND_700, characterSpacing: 2.2, margin: mg(0, 2, 0, 0) },
                    ],
                  },
                ],
              },
              ...(brand.contact ? [{ text: brand.contact, color: MUTED, fontSize: 8.5, margin: mg(0, 8, 0, 0) }] : []),
            ],
          },
          {
            width: 'auto',
            stack: [
              { text: 'Quotation', fontSize: 19, bold: true, color: INK, alignment: 'right' },
              { text: d.quoteNo ?? 'Not saved yet', color: MUTED, alignment: 'right', margin: mg(0, 3, 0, 0) },
              { text: formatDate(d.date), color: MUTED, alignment: 'right' },
              rightAligned(chip(STATUS_LABEL[d.status], CHIP_BG, CHIP_TEXT), mg(0, 6, 0, 0)),
            ],
          },
        ],
      },
      rule(mg(0, 16, 0, 16)),
      // Prepared for / Event
      {
        columns: [
          {
            stack: [
              { text: 'PREPARED FOR', style: 'label' },
              { text: d.guestName, bold: true, color: INK, margin: mg(0, 4, 0, 0) },
              ...(d.phone ? [{ text: `+91 ${formatPhone(d.phone)}`, color: MUTED }] : []),
            ],
          },
          {
            stack: [
              { text: 'EVENT', style: 'label' },
              { text: d.functionName, bold: true, color: INK, margin: mg(0, 4, 0, 0) },
              ...(eventLine(d) ? [{ text: eventLine(d), color: MUTED }] : []),
              ...(venueLine(d) ? [{ text: venueLine(d), color: MUTED }] : []),
            ],
          },
        ],
      },
      rule(mg(0, 16, 0, 0)),
      ...sections,
      ...charges,
      // Totals (kept in one piece so they never split across pages).
      {
        unbreakable: true,
        margin: mg(CONTENT_W - 230, 18, 0, 0),
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 0.75, lineColor: RULE }], margin: mg(0, 0, 0, 8) },
          totalRow('Elements subtotal', d.subtotal),
          ...(d.chargesTotal > 0 ? [totalRow('Additional charges', d.chargesTotal)] : []),
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 230, y2: 0, lineWidth: 0.75, lineColor: RULE }], margin: mg(0, 6, 0, 6) },
          {
            columns: [
              { text: 'Total', bold: true, color: INK, margin: mg(0, 4, 0, 0) },
              { text: formatINR(d.total), fontSize: 17, bold: true, color: INK, alignment: 'right' as const, width: 150 },
            ],
          },
        ],
      },
      { text: 'All amounts in Indian Rupees (₹).', alignment: 'center', color: FAINT, fontSize: 8, margin: mg(0, 28, 0, 0) },
    ],
  };
}

const defaultOf = <T>(m: T | { default: T }): T => ((m as { default?: T }).default ?? m) as T;

/** public/ file → base64 (for pdfmake's virtual file system) */
async function base64Of(file: string): Promise<string> {
  const res = await fetch(asset(file));
  if (!res.ok) throw new Error(`Could not load ${file}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Brand fonts (SIL Open Font License, from Google Fonts) in public/fonts. */
const FONT_FILES = ['Fraunces-Regular.ttf', 'Fraunces-SemiBold.ttf', 'Inter-Regular.ttf', 'Inter-SemiBold.ttf'] as const;

export async function downloadPdf(d: QuoteDocumentData, brand: ExportBrand): Promise<void> {
  const [pdfMake, vfs, fonts, logo] = await Promise.all([
    import('pdfmake/build/pdfmake').then(defaultOf),
    import('pdfmake/build/vfs_fonts').then(defaultOf),
    Promise.all(FONT_FILES.map(async (f) => [f, await base64Of(`fonts/${f}`)] as const)),
    base64Of('logo-mark-pdf.png').then((b) => `data:image/png;base64,${b}`).catch(() => undefined),
  ]);
  pdfMake.addVirtualFileSystem({ ...(vfs as Record<string, string>), ...Object.fromEntries(fonts) });
  pdfMake.addFonts({
    Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' },
    Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-SemiBold.ttf', italics: 'Inter-Regular.ttf', bolditalics: 'Inter-SemiBold.ttf' },
    Fraunces: { normal: 'Fraunces-Regular.ttf', bold: 'Fraunces-SemiBold.ttf', italics: 'Fraunces-Regular.ttf', bolditalics: 'Fraunces-SemiBold.ttf' },
  });
  await pdfMake.createPdf(pdfDefinition(d, brand, logo)).download(quoteFileName(d, 'pdf'));
}
