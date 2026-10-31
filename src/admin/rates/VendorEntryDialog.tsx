/**
 * Log a vendor purchase rate: element, vendor (or add a new one inline), purchase date,
 * quantity + unit, rate per unit, remarks. Entries are append-only — mistakes are voided.
 */
import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SelectField } from '@/components/ui/SelectField';
import { FormAlert } from '@/components/ui/FormAlert';
import { toast } from '@/components/ui/toast';
import { dbErrorMessage } from '@/lib/dbErrors';
import { todayIst } from '@/lib/date';
import { useAddVendorEntry, useRateElements, useVendors } from './useRates';
import { validateVendorEntry, type VendorEntryErrors, type VendorEntryForm } from './vendorEntryValidation';

export function VendorEntryDialog({ elementId, onClose }: { elementId: string | null; onClose: () => void }) {
  const elements = useRateElements();
  const vendors = useVendors();
  const add = useAddVendorEntry();
  const today = todayIst();

  const [form, setForm] = useState<VendorEntryForm>({
    element_id: elementId ?? '',
    vendor_id: '',
    new_vendor: '',
    purchase_date: today,
    qty: '1',
    unit: '',
    rate: '',
    remarks: '',
  });
  const [addingVendor, setAddingVendor] = useState(false);
  const [errors, setErrors] = useState<VendorEntryErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof VendorEntryForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => {
      const next = { ...f, [k]: e.target.value };
      if (k === 'element_id' && !f.unit) next.unit = elements.data?.find((x) => x.id === e.target.value)?.unit ?? '';
      return next;
    });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validateVendorEntry(form, addingVendor, today);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    setErrors({});
    try {
      await add.mutateAsync({ input: r.value, newVendorName: r.newVendorName });
      toast.success('Purchase rate logged.');
      onClose();
    } catch (err) {
      setFormError(dbErrorMessage(err, { '23505': 'An active vendor with this name already exists — choose it from the list.' }));
    }
  }

  return (
    <Modal
      title="Log purchase rate"
      description="Record what a vendor charged. Entries can't be edited — void a wrong one and log it again."
      onClose={onClose}
      locked={add.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="vendor-entry" loading={add.isPending}>
            Save entry
          </Button>
        </>
      }
    >
      <form id="vendor-entry" onSubmit={onSubmit} noValidate className="space-y-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <SelectField
          label="Element"
          placeholder={elements.isLoading ? 'Loading…' : 'Choose element'}
          value={form.element_id}
          onChange={set('element_id')}
          error={errors.element_id}
          options={(elements.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
        />
        {addingVendor ? (
          <div>
            <TextField label="New vendor name" value={form.new_vendor} onChange={set('new_vendor')} error={errors.new_vendor} placeholder="e.g. DIGANI FRUITS & VEGETABLES" />
            <button type="button" onClick={() => setAddingVendor(false)} className="mt-1.5 text-sm font-medium text-brand-600">
              Choose an existing vendor
            </button>
          </div>
        ) : (
          <div>
            <SelectField
              label="Vendor"
              placeholder={vendors.isLoading ? 'Loading…' : 'Choose vendor'}
              value={form.vendor_id}
              onChange={set('vendor_id')}
              error={errors.vendor_id}
              options={(vendors.data ?? []).map((v) => ({ value: v.id, label: v.name }))}
            />
            <button type="button" onClick={() => setAddingVendor(true)} className="mt-1.5 text-sm font-medium text-brand-600">
              + Add a new vendor
            </button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Purchase date" type="date" max={today} value={form.purchase_date} onChange={set('purchase_date')} error={errors.purchase_date} />
          <TextField label="Rate per unit" prefix="₹" inputMode="decimal" value={form.rate} onChange={set('rate')} error={errors.rate} placeholder="0.00" />
          <TextField label="Quantity bought" inputMode="decimal" value={form.qty} onChange={set('qty')} error={errors.qty} />
          <TextField label="Unit" value={form.unit} onChange={set('unit')} error={errors.unit} placeholder="e.g. Kg" />
        </div>
        <TextField label="Remarks" value={form.remarks} onChange={set('remarks')} error={errors.remarks} hint="Optional." />
      </form>
    </Modal>
  );
}
