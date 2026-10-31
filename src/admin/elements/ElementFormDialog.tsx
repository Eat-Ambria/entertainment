/**
 * Add / edit an element: name, unit, default rate, default qty, optional image.
 * When the rate changes on edit, asks for an optional reason (saved to Rate History)
 * and shows the element's recent rate changes.
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
      description={element ? undefined : 'Elements are the building blocks of your packages.'}
      onClose={onClose}
      locked={busy}
      size="lg"
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
      <form id="element-form" onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <FormAlert>{formError}</FormAlert>}

        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="" width={72} height={72} className="h-18 w-18 rounded-lg object-cover" />
          ) : (
            <ImageThumb bucket="element-images" path={imagePath} alt="" size={72} />
          )}
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pickFile} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Icon name="upload" size={16} />
              {preview || imagePath ? 'Replace image' : 'Add image'}
            </Button>
            {(preview || imagePath) && (
              <Button variant="ghost" onClick={removeImage} disabled={busy}>
                Remove
              </Button>
            )}
            <p className="w-full text-xs text-slate-500">Optional. JPG, PNG or WebP, up to 2 MB.</p>
          </div>
        </div>

        <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Entrance Arch" />

        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Pricing</legend>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_7rem_auto_minmax(0,1fr)] sm:items-start">
            <TextField
              label="Cost rate"
              prefix="₹"
              inputMode="decimal"
              value={form.default_rate}
              onChange={set('default_rate')}
              error={errors.default_rate}
              placeholder="0.00"
            />
            <span className="hidden pt-9 text-slate-400 sm:block" aria-hidden="true">
              ×
            </span>
            <TextField label="Multiplier" inputMode="decimal" value={form.multiplier} onChange={set('multiplier')} error={errors.multiplier} placeholder="1" />
            <span className="hidden pt-9 text-slate-400 sm:block" aria-hidden="true">
              =
            </span>
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">Guest rate</p>
              <output aria-label="Guest rate" className="num block rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
                {guestRate === null ? '—' : formatINR(guestRate)}
              </output>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Cost rate is your cost (used for P&L) and is never shown to guests. Guests see only the guest rate.</p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Unit"
            list={unitListId}
            value={form.unit}
            onChange={set('unit')}
            error={errors.unit}
            placeholder="e.g. Nos"
          />
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
            <p id={`${remarksId}-hint`} className="mt-1.5 text-xs text-slate-500">
              Optional. Shown to guests under the element name — in the Studio, on the quotation and in the PDF.
            </p>
          )}
        </div>

        {rateChanged && (
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
        )}

        {element && (
          <section aria-label="Recent rate changes" className="rounded-xl border border-slate-200">
            <h3 className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent rate changes
            </h3>
            {history.isLoading ? (
              <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
            ) : history.isError ? (
              <p className="px-4 py-3 text-sm text-rose-600">Could not load history.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {(history.data ?? []).map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="num font-medium text-slate-800">
                        {h.old_rate === null ? '' : `${formatINR(h.old_rate)} → `}
                        {formatINR(h.new_rate)}
                      </p>
                      {h.reason && <p className="truncate text-xs text-slate-500">{h.reason}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(h.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </form>
    </Modal>
  );
}
