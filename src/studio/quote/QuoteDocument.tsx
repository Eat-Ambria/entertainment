/**
 * The branded quotation as the guest sees it (Guest View, saved quote, later the PDF).
 * Pure presentation from QuoteDocumentData — it has no access to cost, margin, master
 * rates, vendor data or internal notes.
 */
import { useContext } from 'react';
import { AuthContext } from '@/auth/AuthContext';
import { BrandMark } from '@/components/ui/BrandMark';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatPhone } from '@/lib/phone';
import { formatQty } from '@/lib/numbers';
import type { QuoteDocumentData } from './documentData';

const STATUS_LABEL: Record<QuoteDocumentData['status'], string> = {
  draft: 'Draft',
  sent: 'Sent',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

export function QuoteDocument({ data }: { data: QuoteDocumentData }) {
  const contact = useContext(AuthContext)?.profile?.contact_line;
  return (
    <article aria-label="Quotation" className="mx-auto w-full max-w-3xl rounded-2xl border border-stone-200 bg-white p-6 text-slate-900 shadow-2xl shadow-black/25 sm:p-10">
      <header className="flex flex-col gap-6 border-b border-stone-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <BrandMark size="lg" subtitle="Entertainment" />
          {contact && <p className="mt-2 text-xs text-slate-500">{contact}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-2xl font-semibold tracking-tight text-slate-900">Quotation</p>
          <p className="num mt-1 text-sm text-slate-500">{data.quoteNo ?? 'Not saved yet'}</p>
          <p className="text-sm text-slate-500">{formatDate(data.date)}</p>
          <span className="mt-2 inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600">
            {STATUS_LABEL[data.status]}
          </span>
        </div>
      </header>

      <dl className="grid gap-6 border-b border-stone-200 py-6 sm:grid-cols-2">
        <Field label="Prepared for">
          <span className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{data.guestName}</span>
          {data.phone && <span className="block text-slate-500">+91 {formatPhone(data.phone)}</span>}
        </Field>
        <Field label="Event">
          <span className="font-semibold text-slate-900">{data.functionName}</span>
          <span className="block text-slate-500">
            {[data.eventDate && formatDate(data.eventDate), data.sessionName].filter(Boolean).join(' · ')}
          </span>
          <span className="block text-slate-500">{[data.venueName, data.subVenueName].filter(Boolean).join(' · ')}</span>
        </Field>
      </dl>

      {data.sections.map((sec, sIdx) => (
        <section key={`${sec.name}-${sIdx}`} aria-label={sec.name} className="pt-6">
          <div className="flex items-center justify-between gap-3 pb-3">
            <h3 className="text-lg font-semibold text-slate-900">{sec.name}</h3>
            {sec.tier && <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{sec.tier}</span>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-stone-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 pr-3">Element</th>
                <th className="px-3 py-2.5 text-right">Qty</th>
                <th className="hidden px-3 py-2.5 text-right sm:table-cell">Rate</th>
                <th className="py-2.5 pl-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {sec.items.map((i, idx) => (
                <tr key={`${i.name}-${idx}`}>
                  <td className="py-3 pr-3 text-slate-800">
                    {i.name}
                    {i.remarks && <span className="block text-xs text-slate-500 italic">{i.remarks}</span>}
                    <span className="num block text-xs text-slate-400 sm:hidden">@ {formatINR(i.rate)}</span>
                  </td>
                  <td className="num px-3 py-3 text-right text-slate-600">{formatQty(i.qty, i.unit)}</td>
                  <td className="num hidden px-3 py-3 text-right text-slate-600 sm:table-cell">{formatINR(i.rate)}</td>
                  <td className="num py-3 pl-3 text-right font-medium text-slate-900">{formatINR(i.amount)}</td>
                </tr>
              ))}
            </tbody>
            {data.sections.length > 1 && (
              <tfoot>
                <tr className="border-t border-stone-200">
                  <td colSpan={2} className="py-2.5 pr-3 text-sm text-slate-500 sm:hidden">
                    {sec.name} subtotal
                  </td>
                  <td colSpan={3} className="hidden py-2.5 pr-3 text-right text-sm text-slate-500 sm:table-cell">
                    {sec.name} subtotal
                  </td>
                  <td className="num py-2.5 pl-3 text-right font-semibold text-slate-900">{formatINR(sec.subtotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      ))}

      {data.charges.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Additional charges</p>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {data.charges.map((c, idx) => (
              <li key={`${c.description}-${idx}`} className="flex justify-between gap-3 py-2.5">
                <span className="text-slate-800">{c.description}</span>
                <span className="num font-medium text-slate-900">{formatINR(c.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-6 ml-auto w-full max-w-xs space-y-2 border-t border-stone-200 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Elements subtotal</dt>
          <dd className="num text-slate-900">{formatINR(data.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Additional charges</dt>
          <dd className="num text-slate-900">{formatINR(data.chargesTotal)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-stone-200 pt-3">
          <dt className="font-semibold text-slate-900">Total</dt>
          <dd className="num text-2xl font-semibold text-slate-900" aria-label="Final total">
            {formatINR(data.total)}
          </dd>
        </div>
      </dl>

      <p className="mt-8 text-center text-xs text-slate-400">All amounts in Indian Rupees (₹).</p>
    </article>
  );
}
