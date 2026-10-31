/**
 * A saved quotation, reopened from its snapshot — exactly what was saved, unaffected by
 * later changes to elements or packages. Guest-facing. Draft quotes can be edited.
 */
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useGuestQuote } from '@/data/quotes';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { QuoteDocument } from '../quote/QuoteDocument';
import { QuotationHero } from '../quote/QuotationHero';
import { m } from 'motion/react';
import { smooth } from '@/lib/motion';
import { documentFromSaved } from '../quote/documentData';
import { STUDIO_NEW_QUOTE } from '../steps';
import { useEditQuote } from '../quote/useEditQuote';
import { DB_OUTDATED_MESSAGE, dbErrorMessage, errorCode } from '@/lib/dbErrors';

export default function SavedQuotePage() {
  const { id } = useParams();
  const quote = useGuestQuote(id);
  const edit = useEditQuote();
  const navigate = useNavigate();
  const location = useLocation();
  // Back to wherever you came from; opened directly (no history) → Studio home.
  const goBack = () => (location.key === 'default' ? navigate('/studio') : navigate(-1));

  if (quote.isLoading) return <Spinner full label="Loading quotation…" />;
  // "Not found" only when there really is no such quote; any other error says what's wrong
  // (e.g. a missing column = the database needs the latest migration).
  const missing = !quote.isError || ['PGRST116', '22P02'].includes(errorCode(quote.error) ?? '');
  if (quote.isError && !missing) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't open this quotation"
        description={dbErrorMessage(quote.error, { '42703': DB_OUTDATED_MESSAGE })}
        action={
          <Button variant="secondary" onClick={() => void quote.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (quote.isError || !quote.data) {
    return (
      <EmptyState
        icon="alert"
        title="Quotation not found"
        description="It may have been removed, or the link is incomplete."
        action={
          <Link to={STUDIO_NEW_QUOTE} className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Start a new quote
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void goBack()}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ivory/60 transition-colors duration-200 hover:text-ivory"
          >
            <Icon name="arrowLeft" size={16} /> Back
          </button>
          <Link to={STUDIO_NEW_QUOTE} className="inline-flex items-center gap-1.5 text-sm font-medium text-ivory/60 transition-colors duration-200 hover:text-ivory">
            <Icon name="plus" size={16} /> New quote
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {quote.data.status === 'draft' && (
            <Button variant="secondary" loading={edit.busy} onClick={() => void edit.open(quote.data!.id)}>
              <Icon name="edit" size={16} /> Edit quote
            </Button>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-3xl">
        <QuotationHero data={documentFromSaved(quote.data)} />
      </div>
      <m.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={smooth}>
        <QuoteDocument data={documentFromSaved(quote.data)} />
      </m.div>
    </div>
  );
}
