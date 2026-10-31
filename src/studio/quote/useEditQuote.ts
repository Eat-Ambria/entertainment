/**
 * Opens a saved draft quote in the Guest Studio for editing: loads it into the
 * quote draft and jumps to the Customise step (elements, quantities, rates). Saving then updates the same quote.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { QuoteNotEditableError, quoteEditApi } from '@/data/quoteEdit';
import { toast } from '@/components/ui/toast';
import { dbErrorMessage } from '@/lib/dbErrors';
import { getQuoteDraft, setQuoteDraft } from '../quoteDraft';
import { STUDIO_NEW_QUOTE } from '../steps';

export function useEditQuote() {
  const { session } = useAuth();
  const userId = session?.user.id ?? 'anon';
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  /** True when the Studio holds unsaved work for a different quote (ask before replacing it). */
  const hasOtherDraft = useCallback(
    (quoteId: string) => {
      const d = getQuoteDraft(userId);
      return d.guest !== null && d.saved?.id !== quoteId;
    },
    [userId],
  );

  const open = useCallback(
    async (quoteId: string) => {
      setBusy(true);
      try {
        const { draft, droppedLines } = await quoteEditApi.load(quoteId);
        setQuoteDraft(userId, () => draft);
        if (droppedLines > 0) {
          toast.error(`${droppedLines} ${droppedLines === 1 ? 'element was' : 'elements were'} deleted and left out of this quote.`);
        }
        navigate(`${STUDIO_NEW_QUOTE}?step=customise`);
      } catch (err) {
        toast.error(err instanceof QuoteNotEditableError ? err.message : dbErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [userId, navigate],
  );

  return { open, busy, hasOtherDraft };
}
