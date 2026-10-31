/**
 * Catalogue → Additional charges: the master rates (Transportation, Labour) the Guest Studio
 * pre-adds to new quotes.
 */
import { PageHeader } from '@/components/ui/PageHeader';
import { ChargeRatesSection } from '../charges/ChargeRatesSection';

export default function ChargesPage() {
  return (
    <>
      <PageHeader
        title="Additional charges"
        description="Transportation is a fixed amount per quote; labour is charged per labour, per package chosen."
      />
      <div>
        <ChargeRatesSection />
      </div>
    </>
  );
}
