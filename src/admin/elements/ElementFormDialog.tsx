/**
 * Add / edit an element: name, unit, default rate, default qty, optional image.
 * When the rate changes on edit, asks for an optional reason (saved to Rate History)
 * and shows the element's recent rate changes. Two columns: photo + rate history on the left,
 * details on the right; pricing reads as cost × multiplier = guest rate, with the margin per unit.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FormAlert } from '@/components/ui/FormAlert';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatINR, roundMoney } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { parseMoney, parseQty, toInput } from '@/lib/numbers';
import { IMAGE_TYPES, uploadImage, userFilePath, validateImage } from '@/lib/storage';
import type { Element } from './elementsApi';
import { UNIT_SUGGESTIONS, validateElement, type ElementForm, type ElementFormErrors } from './elementValidation';
import { useElementRateHistory, useSaveElement } from './useElements';

interface Props {
  element: Element | null; // null = create
  onClose: () => void;
}

export function ElementFormDialog({ element, onClose }: Props) {
  const { session } = useAuth();
  const save = useSaveElement();
  const history = useElementRateHistory(element?.id ?? null);
  const unitListId = useId();
  const remarksId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ElementForm>({
    name: element?.name ?? '',
    unit: element?.unit ?? '',
    default_rate: toInput(element?.default_rate),
    multiplier: element && element.multiplier !== 1 ? toInput(element.multiplier) : '',
    default_qty: toInput(element?.default_qty ?? (element ? null : 1)),
    remarks: element?.remarks ?? '',
    reason: '',
  });
  const [errors, setErrors] = useState<ElementFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(element?.image_path ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const guestRate = (() => {
    const r = parseMoney(form.default_rate);
    const m = form.multiplier.trim() === '' ? 1 : parseQty(form.multiplier);
    return r === null || m === null ? null : roundMoney(r * m);
  })();

  // Earned per unit at the guest rate (internal — this dialog is Workspace only).
  const cost = parseMoney(form.default_rate);
  const margin = guestRate !== null && cost !== null ? { amount: roundMoney(guestRate - cost), pct: guestRate > 0 ? ((guestRate - cost) / guestRate) * 100 : null } : null;

  const rateChanged = element !== null && parseMoney(form.default_rate) !== element.default_rate;
  const set = (k: keyof ElementForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const invalid = validateImage(f);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setFormError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function removeImage() {
    setFile(null);
    setPreview(null);
    setImagePath(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = validateElement(form, imagePath);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let input = result.value;
      if (file && session) {
        const path = await uploadImage('element-images', userFilePath(session.user.id, 'elements', file), file);
        input = { ...input, image_path: path };
      }
      await save.mutateAsync({ id: element?.id ?? null, input, reason: rateChanged ? result.reason : null });
      toast.success(element ? 'Element updated.' : 'Element added.');
      onClose();
    } catch (err) {
      setFormError(
        dbErrorMessage(err, { '23505': 'An active element with this name already exists.' }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={element ? 'Edit element' : 'Add element'}
      description={element ? 'Changes apply to new quotes only.' : 'Elements are the building blocks of your packages.'}
      onClose={onClose}
      locked={busy}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="element-form" loading={busy}>
            {element ? 'Save changes' : 'Add element'}
          </Button>
        </>
      }
    >
      <form id="element-form" onSubmit={onSubmit} noValidate className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
        {/* Left: photo + rate history */}
        <aside className="space-y-4">
          {/* Phones: small photo beside its buttons; from md up a large square above them. */}
          <div className="flex items-center gap-4 md:block">
            <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pickFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label={preview || imagePath ? 'Change photo' : 'Choose photo'}
              className="group relative block h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-dashed md:aspect-square md:h-auto md:w-full border-slate-300 bg-slate-50 transition-colors duration-150 hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {preview ? (
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : imagePath ? (
                <ImageThumb bucket="element-images" path={imagePath} alt="" fill aspect="aspect-square" className="h-full" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                  <Icon name="image" size={28} />
                  <span className="hidden text-xs font-medium md:inline">Click to add a photo</span>
                </span>
              )}
              {(preview || imagePath) && (
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-linear-to-t from-black/60 to-transparent pt-8 pb-2.5 text-xs font-medium text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Icon name="upload" size={14} /> Change photo
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2 md:mt-2">
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 py-2">
                <Icon name="upload" size={16} />
                {preview || imagePath ? 'Replace image' : 'Add image'}
              </Button>
              {(preview || imagePath) && (
                <Button variant="ghost" onClick={removeImage} disabled={busy} className="py-2">
                  Remove
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Optional. JPG, PNG or WebP, up to 2 MB.</p>
            </div>
          </div>

          {element && (
            <section aria-label="Recent rate changes" className="rounded-xl border border-slate-200 p-4">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Icon name="history" size={14} /> Recent rate changes
              </h3>
              {history.isLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading…</p>
              ) : history.isError ? (
                <p className="mt-3 text-sm text-rose-600">Could not load history.</p>
              ) : (history.data ?? []).length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No changes yet.</p>
              ) : (
                <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
                  {(history.data ?? []).map((h) => (
                    <li key={h.id} className="relative text-sm">
                      <span className="absolute top-1.5 -left-[1.3rem] h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
                      <p className="num font-medium text-slate-800">
                        {h.old_rate === null ? '' : `${formatINR(h.old_rate)} → `}
                        {formatINR(h.new_rate)}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(h.changed_at)}</p>
                      {h.reason && <p className="mt-0.5 text-xs text-slate-500">{h.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </aside>

        {/* Right: details */}
        <div className="min-w-0 space-y-5">
          {formError && <FormAlert>{formError}</FormAlert>}

          <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Entrance Arch" />

          <fieldset className="overflow-hidden rounded-2xl border border-slate-200">
            <legend className="sr-only">Pricing</legend>
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing</p>
              <p className="flex items-center gap-1 text-xs text-slate-400">
                <Icon name="lock" size={12} /> Cost is never shown to guests
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_7rem] sm:items-start">
              <TextField
                label="Cost rate"
                prefix="₹"
                inputMode="decimal"
                value={form.default_rate}
                onChange={set('default_rate')}
                error={errors.default_rate}
                placeholder="0.00"
              />
              <span className="hidden pt-9 text-lg text-slate-300 sm:block" aria-hidden="true">
                ×
              </span>
              <TextField label="Multiplier" inputMode="decimal" value={form.multiplier} onChange={set('multiplier')} error={errors.multiplier} placeholder="1" />
            </div>
            {/* Result: what the guest pays, and what is earned per unit. */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-t border-brand-100 bg-linear-to-r from-brand-50 to-white px-4 py-3.5">
              <div>
                <p className="text-xs font-medium text-brand-800/70">Guest rate (what the guest sees)</p>
                <output aria-label="Guest rate" className="num block font-display text-3xl leading-tight text-brand-800">
                  {guestRate === null ? '—' : formatINR(guestRate)}
                </output>
              </div>
              {margin && (
                <p className="text-right text-xs text-slate-500">
                  Margin per unit
                  <span className={`num block text-sm font-semibold ${margin.amount < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {formatINR(margin.amount)}
                    {margin.pct !== null ? ` · ${margin.pct.toFixed(1)}%` : ''}
                  </span>
                </p>
              )}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Unit" list={unitListId} value={form.unit} onChange={set('unit')} error={errors.unit} placeholder="e.g. Nos" />
            <TextField
              label="Default quantity"
              inputMode="decimal"
              value={form.default_qty}
              onChange={set('default_qty')}
              error={errors.default_qty}
              hint="Optional"
            />
            <datalist id={unitListId}>
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor={remarksId} className="mb-1.5 block text-sm font-medium text-slate-700">
              Remarks
            </label>
            <textarea
              id={remarksId}
              rows={2}
              maxLength={500}
              value={form.remarks}
              onChange={set('remarks')}
              aria-invalid={errors.remarks ? true : undefined}
              aria-describedby={`${remarksId}-hint`}
              placeholder="Where this element is used, e.g. Entrance gate, stage backdrop, Exotica lawn"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {errors.remarks ? (
              <p className="mt-1.5 text-sm text-rose-600">{errors.remarks}</p>
            ) : (
              <p id={`${remarksId}-hint`} className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-500">
                <Icon name="eye" size={13} className="mt-px shrink-0" />
                Optional. Shown to guests under the element name — in the Studio, on the quotation and in the PDF.
              </p>
            )}
          </div>

          {rateChanged && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <TextField
                label="Reason for rate change"
                value={form.reason}
                onChange={set('reason')}
                error={errors.reason}
                placeholder="e.g. Vendor price increase"
                hint={`${formatINR(element!.default_rate)} → ${
                  parseMoney(form.default_rate) !== null ? formatINR(parseMoney(form.default_rate)!) : '—'
                } · saved in Rate History`}
              />
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
