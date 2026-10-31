/**
 * "Download PDF" for a saved quote. Always reads the saved snapshot
 * from the database at click time, so the file matches what was saved — never the
 * unsaved draft.
 */
import { useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { quotesApi } from '@/data/quotes';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { documentFromSaved } from './documentData';
import { downloadPdf, exportBrand } from './exportQuote';

export function DownloadButtons({ quoteId, variant = 'secondary' }: { quoteId: string; variant?: 'secondary' | 'outline-light' }) {
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const data = documentFromSaved(await quotesApi.getGuestQuote(quoteId));
      await downloadPdf(data, exportBrand(profile));
    } catch (err) {
      console.error('PDF download failed', err);
      toast.error("Couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = 'Downloads the last saved version of this quote';
  return (
    <Button variant={variant} title={title} loading={busy} onClick={() => void run()}>
      <Icon name="download" size={16} /> Download PDF
    </Button>
  );
}
