/**
 * Create / edit a package: details (name, tier, display price, description, image, video,
 * active) + a selectable table of all active elements with default quantities.
 * Saves package and mapping in one RPC call. Warns before leaving with unsaved changes.
 * Functions are optional: a tagged package is shown first for those functions in the Studio,
 * but every package stays available for every function.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FormAlert } from '@/components/ui/FormAlert';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/toast';
import { formatINR } from '@/lib/money';
import { parseQty, toInput } from '@/lib/numbers';
import { lineAmount, linesSubtotal } from '@/lib/pricing';
import { dbErrorMessage } from '@/lib/dbErrors';
import { IMAGE_TYPES, uploadImage, userFilePath, validateImage } from '@/lib/storage';
import { PICKER_LIMIT, type PackageDetail, type PickerElement, type Tier } from '../packages/packagesApi';
import { validatePackage, type PackageForm, type PackageFormErrors, type SelectedItems } from '../packages/packageValidation';
import { usePackage, usePickerElements, useSavePackage, useTiers } from '../packages/usePackages';
import { useEventOptions } from '@/data/eventOptions';

// ---------------------------------------------------------------------------
// Element row (memoised: typing a qty re-renders only that row)
// ---------------------------------------------------------------------------
interface RowProps {
  el: PickerElement;
  qty: string | undefined;
  error: string | undefined;
  onToggle: (el: PickerElement) => void;
  onQty: (id: string, qty: string) => void;
}

const ElementRow = memo(function ElementRow({ el, qty, error, onToggle, onQty }: RowProps) {
  const selected = qty !== undefined;
  const parsed = selected ? parseQty(qty) : null;
  return (
    <tr className={selected ? 'bg-brand-50/40' : 'hover:bg-slate-50'}>
      <td className="w-10 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(el)}
          aria-label={`Include ${el.name}`}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-3">
          <ImageThumb bucket="element-images" path={el.image_path} alt="" size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{el.name}</p>
            {el.remarks && <p className="truncate text-xs italic text-slate-500">{el.remarks}</p>}
            {!el.is_active && <p className="text-xs text-amber-600">Archived — can stay, can't be re-added</p>}
          </div>
        </div>
      </td>
      <td className="num px-4 py-2.5 text-right text-slate-600">
        {formatINR(el.default_rate)}
        {el.unit && <span className="text-xs text-slate-400"> / {el.unit}</span>}
      </td>
      <td className="w-32 px-4 py-2.5">
        <input
          type="text"
          inputMode="decimal"
          value={qty ?? ''}
          disabled={!selected}
          onChange={(e) => onQty(el.id, e.target.value)}
          aria-label={`Default quantity for ${el.name}`}
          aria-invalid={error ? true : undefined}
          placeholder="—"
          className={`num w-full rounded-md border px-2 py-1.5 text-right text-sm outline-none disabled:bg-slate-50 disabled:text-slate-300 ${
            error ? 'border-rose-400 focus:ring-2 focus:ring-rose-100' : 'border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
          }`}
        />
        {error && <p className="mt-1 text-right text-xs text-rose-600">{error}</p>}
      </td>
      <td className="num w-36 px-4 py-2.5 text-right font-medium text-slate-900">
        {selected && parsed !== null ? formatINR(lineAmount(parsed, el.default_rate)) : <span className="text-slate-300">—</span>}
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Functions (optional): which functions this package is meant for
// ---------------------------------------------------------------------------
function FunctionsPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const options = useEventOptions();
  const all = options.data?.functions ?? [];
  const nameOf = (id: string) => all.find((f) => f.id === id)?.name ?? 'Function';
  const left = all.filter((f) => !value.includes(f.id));
  return (
    <div>
      <label htmlFor="pkg-function-add" className="mb-1.5 block text-sm font-medium text-slate-700">
        Functions <span className="font-normal text-slate-400">(optional)</span>
      </label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Chosen functions">
          {value.map((id) => (
            <li key={id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-sm font-medium text-brand-700">
              {nameOf(id)}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== id))}
                className="rounded-full p-1 text-brand-500 hover:bg-brand-100 hover:text-brand-800"
                aria-label={`Remove ${nameOf(id)}`}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        id="pkg-function-add"
        value=""
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        disabled={options.isLoading || left.length === 0}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm"
      >
        <option value="">{value.length ? 'Add another function…' : 'Add a function…'}</option>
        {left.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <p className="mt-1.5 text-xs text-slate-500">
        {value.length
          ? 'Shown first in the Guest Studio for these functions — still available for every other function.'
          : 'No function = suits any function. Packages are never hidden from the Guest Studio.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor (mounted once data is loaded, so initial state comes straight from props)
// ---------------------------------------------------------------------------
interface EditorProps {
  pkg: PackageDetail | null;
  tiers: Tier[];
  elements: PickerElement[];
}

function PackageEditor({ pkg, tiers, elements }: EditorProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const save = useSavePackage();
  const fileRef = useRef<HTMLInputElement>(null);
  const leavingAfterSave = useRef(false);

  const [form, setForm] = useState<PackageForm>(() => ({
    name: pkg?.name ?? '',
    tier_id: pkg?.tier_id ?? tiers[0]?.id ?? '',
    display_price: toInput(pkg?.display_price),
    description: pkg?.description ?? '',
    video_url: pkg?.video_url ?? '',
    is_active: pkg?.is_active ?? true,
    function_ids: pkg?.function_ids ?? [],
  }));
  const [selected, setSelected] = useState<SelectedItems>(
    () => new Map((pkg?.items ?? []).map((i) => [i.element_id, toInput(i.default_qty)])),
  );
  const [imagePath, setImagePath] = useState<string | null>(pkg?.image_path ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<PackageFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);

  const [initialSnapshot] = useState(() => JSON.stringify({ form, selected: [...selected], imagePath }));
  const dirty = JSON.stringify({ form, selected: [...selected], imagePath }) !== initialSnapshot || file !== null;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingAfterSave.current && currentLocation.pathname !== nextLocation.pathname,
  );

  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  const onToggle = useCallback((el: PickerElement) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(el.id)) next.delete(el.id);
      else next.set(el.id, toInput(el.default_qty ?? 1));
      return next;
    });
  }, []);

  const onQty = useCallback((id: string, qty: string) => {
    setSelected((prev) => new Map(prev).set(id, qty));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return elements.filter(
      (e) =>
        (!term || e.name.toLowerCase().includes(term)) &&
        (!onlySelected || selected.has(e.id)) &&
        (e.is_active || selected.has(e.id)),
    );
  }, [elements, search, onlySelected, selected]);

  const total = useMemo(
    () =>
      linesSubtotal(
        [...selected].flatMap(([id, q]) => {
          const el = byId.get(id);
          const qty = parseQty(q);
          return el && qty !== null ? [{ qty, rate: el.default_rate }] : [];
        }),
      ),
    [selected, byId],
  );

  const set = (k: 'name' | 'display_price' | 'description' | 'video_url') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const invalid = validateImage(f);
    setFormError(invalid);
    if (invalid) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const result = validatePackage(form, selected, imagePath);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError(result.errors.items ?? (result.errors.itemQty ? 'Fix the highlighted quantities.' : null));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      let input = result.value;
      if (file && session) {
        const path = await uploadImage('package-images', userFilePath(session.user.id, 'packages', file), file);
        input = { ...input, image_path: path };
      }
      await save.mutateAsync({ id: pkg?.id ?? null, input });
      toast.success(pkg ? 'Package saved.' : 'Package created.');
      leavingAfterSave.current = true;
      navigate('/admin/packages');
    } catch (err) {
      setFormError(dbErrorMessage(err, { '23505': 'An active package with this name already exists in this tier.' }));
    } finally {
      setBusy(false);
    }
  }

  const tierName = tiers.find((t) => t.id === form.tier_id)?.name;
  const hasImage = Boolean(preview || imagePath);

  return (
    <form onSubmit={onSubmit} noValidate className="pb-28">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link to="/admin/packages" className="inline-flex items-center gap-1 text-ivory/70 hover:text-ivory">
          <Icon name="chevronLeft" size={16} /> Packages
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl leading-tight text-ivory sm:text-4xl">{pkg ? `Edit ${pkg.name}` : 'New package'}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${form.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
        >
          {form.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-ivory/75">Every package is available for every function — tag functions to show it first for them.</p>

      {formError && (
        <div className="mt-5">
          <FormAlert>{formError}</FormAlert>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* 1 · Basics */}
          <section aria-label="Package details" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <StepTitle n={1} title="Basics" hint="Name, tier and the functions it suits." />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <TextField label="Package name" value={form.name} onChange={set('name')} error={errors.name} placeholder="e.g. Royal Package" />
              <div>
                <label htmlFor="pkg-tier" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Tier
                </label>
                <select
                  id="pkg-tier"
                  value={form.tier_id}
                  onChange={(e) => setForm((f) => ({ ...f, tier_id: e.target.value }))}
                  aria-invalid={errors.tier_id ? true : undefined}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  {tiers.length === 0 && <option value="">No tiers available</option>}
                  {tiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {errors.tier_id && <p className="mt-1.5 text-sm text-rose-600">{errors.tier_id}</p>}
              </div>
              <div className="sm:col-span-2">
                <FunctionsPicker value={form.function_ids} onChange={(function_ids) => setForm((f) => ({ ...f, function_ids }))} />
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <StepTitle n={2} title="Shown to guests" hint="What the guest sees on the package card." />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Video link"
                  type="url"
                  value={form.video_url}
                  onChange={set('video_url')}
                  error={errors.video_url}
                  placeholder="https://youtube.com/…"
                  hint="Optional."
                />
                <div className="sm:col-span-2">
                  <label htmlFor="pkg-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Description
                  </label>
                  <textarea
                    id="pkg-desc"
                    rows={2}
                    value={form.description}
                    onChange={set('description')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    placeholder="Optional. A short line guests will see."
                  />
                  {errors.description && <p className="mt-1.5 text-sm text-rose-600">{errors.description}</p>}
                </div>
              </div>
            </div>
          </section>

          {/* 3 · Elements */}
          <section aria-label="Package elements" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <StepBadge n={3} />
                <div>
                  <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                    Elements
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{selected.size} selected</span>
                  </h2>
                  <p className="text-sm text-slate-500">Tick the elements in this package and set their default quantity.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={onlySelected}
                    onChange={(e) => setOnlySelected(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                  />
                  Selected only
                </label>
                <label className="relative">
                  <span className="sr-only">Filter elements</span>
                  <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter elements"
                    className="w-48 rounded-full border border-slate-300 bg-white py-1.5 text-slate-900 placeholder:text-slate-400 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
              </div>
            </div>

            {elements.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon="elements"
                  title="No elements yet"
                  description="Add elements first, then come back to build packages."
                  action={
                    <Link to="/admin/elements" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Go to Elements
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full min-w-160 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2.5">
                        <span className="sr-only">Include</span>
                      </th>
                      <th className="px-2 py-2.5">Element</th>
                      <th className="px-4 py-2.5 text-right">Guest rate</th>
                      <th className="px-4 py-2.5 text-right">Default qty</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((el) => (
                      <ElementRow key={el.id} el={el} qty={selected.get(el.id)} error={errors.itemQty?.[el.id]} onToggle={onToggle} onQty={onQty} />
                    ))}
                  </tbody>
                </table>
                {visible.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No elements match.</p>}
                {elements.length >= PICKER_LIMIT && <p className="p-3 text-center text-xs text-slate-400">Showing the first {PICKER_LIMIT} elements.</p>}
              </div>
            )}
          </section>
        </div>

        {/* Live guest preview + status (stays in view) */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <p className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Icon name="eye" size={14} /> Guest card preview
            </p>
            <div className="p-4">
              <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pickFile} />
              {/* The package card as guests see it in the Studio (dark stage). */}
              <div className="overflow-hidden rounded-xl bg-stage-950 text-ivory ring-1 ring-black/5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  aria-label={hasImage ? 'Change package photo' : 'Choose package photo'}
                  className="group relative block w-full overflow-hidden"
                >
                  {preview ? (
                    <img src={preview} alt="" className="aspect-16/10 w-full object-cover" />
                  ) : (
                    <ImageThumb bucket="package-images" path={imagePath} alt="" fill dark aspect="aspect-16/10" />
                  )}
                  <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-stage-950/95 via-stage-950/20 to-transparent" />
                  {tierName && (
                    <span className="absolute top-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-ivory ring-1 ring-white/20">
                      {tierName}
                    </span>
                  )}
                  <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-ivory opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <Icon name="upload" size={12} /> {hasImage ? 'Change' : 'Add photo'}
                  </span>
                  <span className="absolute inset-x-3 bottom-2.5 truncate text-left font-display text-lg text-ivory">{form.name.trim() || 'Package name'}</span>
                </button>
                <div className="space-y-2 px-3 py-3">
                  <p className="line-clamp-2 min-h-8 text-xs text-ivory/65">{form.description.trim() || 'A short line guests will see.'}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span />
                    {form.video_url.trim() && (
                      <span className="flex items-center gap-1 text-brand-300">
                        <Icon name="present" size={12} /> Video
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy} className="flex-1 py-2">
                  <Icon name="upload" size={16} /> {hasImage ? 'Replace' : 'Add image'}
                </Button>
                {hasImage && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    className="py-2"
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                      setImagePath(null);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <span>
              <span className="block text-sm font-medium text-slate-800">Active</span>
              <span className="block text-xs text-slate-500">Shown in the Guest Studio.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="relative h-5 w-9 cursor-pointer appearance-none rounded-full bg-slate-300 transition before:absolute before:top-0.5 before:left-0.5 before:h-4 before:w-4 before:rounded-full before:bg-white before:transition checked:bg-brand-600 checked:before:translate-x-4"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">Elements</p>
              <p className="num mt-1 font-display text-2xl text-slate-900">{selected.size}</p>
            </div>
            <div className="rounded-2xl border border-brand-200 bg-linear-to-br from-brand-50 to-white p-4 shadow-sm">
              <p className="text-xs text-brand-800/70">Package value</p>
              <p className="num mt-1 truncate font-display text-xl text-brand-800">{formatINR(total)}</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky summary */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-8px_24px_rgb(15_23_42/0.06)] backdrop-blur lg:left-72">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-sm text-slate-600" aria-live="polite">
            <span className="font-semibold text-slate-900">{selected.size}</span> {selected.size === 1 ? 'element' : 'elements'} ·
            Elements total <span className="num font-semibold text-brand-700">{formatINR(total)}</span>
          </p>
          <div className="flex gap-2">
            <Link to="/admin/packages" className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </Link>
            <Button type="submit" loading={busy}>
              {pkg ? 'Save package' : 'Create package'}
            </Button>
          </div>
        </div>
      </div>

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          body="You have changes to this package that haven't been saved."
          confirmLabel="Discard changes"
          onConfirm={() => blocker.proceed()}
          onClose={() => blocker.reset()}
        />
      )}
    </form>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white shadow-sm" aria-hidden="true">
      {n}
    </span>
  );
}

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <StepBadge n={n} />
      <div>
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route component: loads data, then mounts the editor
// ---------------------------------------------------------------------------
export default function PackageEditorPage() {
  const { id } = useParams();
  const packageId = id ?? null;
  const pkg = usePackage(packageId);
  const tiers = useTiers();
  const includeIds = useMemo(() => (pkg.data?.items ?? []).map((i) => i.element_id), [pkg.data]);
  const picker = usePickerElements(includeIds, !packageId || pkg.isSuccess);

  const error = pkg.error ?? tiers.error ?? picker.error;
  if (error) {
    return (
      <div className="space-y-3">
        <FormAlert>{dbErrorMessage(error)}</FormAlert>
        <Link to="/admin/packages" className="text-sm font-medium text-brand-600">
          Back to Packages
        </Link>
      </div>
    );
  }
  if ((packageId && !pkg.data) || !tiers.data || !picker.data) return <Spinner label="Loading package…" />;

  return <PackageEditor key={packageId ?? 'new'} pkg={pkg.data ?? null} tiers={tiers.data} elements={picker.data} />;
}
