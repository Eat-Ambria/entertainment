/**
 * Guest Studio step 4 — Quotation: the live quotation and actions
 * (Save Quote and — once saved — Download PDF of the saved copy), in a side panel.
 * Sharing appears only once a delivery channel is configured, so there is no share button yet.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { useEventOptions } from '@/data/eventOptions';
import { useSaveQuote } from '@/data/quotes';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FormAlert } from '@/components/ui/FormAlert';
import { toast } from '@/components/ui/toast';
import { useQuoteDraft } from '../quoteDraft';
import { buildSavePayload, summariseQuote } from './quoteTotals';
import { documentFromDraft } from './documentData';
import { QuoteDocument } from './QuoteDocument';
import { saveErrorInfo } from './saveErrors';
import { DownloadButtons } from './DownloadButtons';
import { SaveCelebration } from '@/components/ui/SaveCelebration';
import { QuotationHero } from './QuotationHero';
import { m } from 'motion/react';
import { smooth } from '@/lib/motion';

export function QuoteStep({ onBack }: { onBack: () => void }) {
  const { session } = useAuth();
  const [draft, updateDraft] = useQuoteDraft(session?.user.id ?? 'anon');
  const options = useEventOptions();
  const save = useSaveQuote();
  const [showErrors, setShowErrors] = useState(false);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Celebration after a save the server confirmed (one per save; re-keyed so the next save plays again).
  const [celebrate, setCelebrate] = useState<{ key: number; quoteNo: string; created: boolean } | null>(null);

  // A locked-quote warning is brought into view.
  useEffect(() => {
    if (!lockedMessage) return;
    const el = bannerRef.current;
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }, [lockedMessage]);

  // Opening this step takes the user straight down to the quotation itself (after the step slides in).
  const docRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => docRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 350);
    return () => clearTimeout(t);
  }, []);

  const summary = useMemo(() => summariseQuote(draft), [draft]);
  const doc = useMemo(() => documentFromDraft(draft, options.data, summary), [draft, options.data, summary]);

  async function onSave(asNew = false) {
    if (save.isPending) return; // no double submits while a save is in flight
    const built = buildSavePayload(draft);
    if (!built) {
      setShowErrors(true);
      return;
    }
    const payload = asNew ? { ...built, quote_id: null } : built;
    setLockedMessage(null);
    try {
      const firstSave = !draft.saved || asNew;
      const r = await save.mutateAsync(payload);
      setCelebrate({ key: Date.now(), quoteNo: r.quote_no, created: firstSave });
      updateDraft((d) => ({ ...d, saved: { id: r.id, quoteNo: r.quote_no, status: 'draft' } }));
      toast.success(`Quote ${r.quote_no} saved.`);
    } catch (err) {
      const info = saveErrorInfo(err);
      if (info.locked) setLockedMessage(info.message);
      else toast.error(info.message);
    }
  }

  const fireworks = celebrate && (
    <SaveCelebration
      key={celebrate.key}
      title="Quotation Saved Successfully"
      detail={`${celebrate.quoteNo} · ${celebrate.created ? 'created' : 'updated'}`}
      onDone={() => setCelebrate(null)}
    />
  );

  return (
    <div className="space-y-5">
      {fireworks}
      {lockedMessage && (
        <div ref={bannerRef} tabIndex={-1} role="alert" className="flex animate-rise flex-col gap-3 rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 outline-none sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-amber-200">
            <Icon name="lock" size={18} className="mt-0.5 shrink-0" /> {lockedMessage}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="gold" onClick={() => void onSave(true)} loading={save.isPending}>
              Save as a new quote
            </Button>
          </div>
        </div>
      )}

      {showErrors && !summary.valid && (
        <FormAlert>
          Go back to Customise and fix the highlighted elements.
        </FormAlert>
      )}

      <QuotationHero data={doc} />

      {/* Quotation on the left, actions in a side panel that stays in view (stacks below on phones). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_20rem]">
        <m.div ref={docRef} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={smooth} className="min-w-0 scroll-mt-40">
          <QuoteDocument data={doc} />
        </m.div>

        <aside
          aria-label="Quotation actions"
          className="relative overflow-hidden rounded-2xl border border-brand-300/25 bg-stage-900/90 p-5 text-ivory shadow-2xl shadow-black/50 lg:sticky lg:top-40"
        >
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgb(226_183_102/0.14),transparent_55%)]" />
          <div className="relative">
            {/* The total is shown once, in the hero above — this panel is only for actions. */}
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-300">Quotation</p>
            <p className="mt-1 flex items-center gap-2 font-display text-xl text-ivory">
              <span className={`h-2 w-2 rounded-full ${draft.saved ? 'bg-emerald-400' : 'bg-amber-300'}`} aria-hidden="true" />
              {draft.saved ? <span className="num">{draft.saved.quoteNo}</span> : 'Not saved yet'}
            </p>
            <p className="mt-1 text-xs text-ivory/45">{draft.saved ? 'Saved — download the PDF or keep editing.' : 'Save it to get a quote number and the PDF.'}</p>
            <div className="gold-hairline my-4" />
            <div className="space-y-2">
              <Button variant="gold" full onClick={() => void onSave()} loading={save.isPending}>
                {draft.saved ? 'Save changes' : 'Save quote'}
              </Button>
              {draft.saved && (
                <div className="grid">
                  <DownloadButtons quoteId={draft.saved.id} variant="outline-light" />
                </div>
              )}
            </div>
            <div className="mt-4 border-t border-white/10 pt-3">
              <button
                type="button"
                onClick={onBack}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ivory/70 transition-colors duration-150 hover:bg-white/5 hover:text-ivory"
              >
                <Icon name="edit" size={16} className="text-brand-300" /> Edit elements & rates
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
