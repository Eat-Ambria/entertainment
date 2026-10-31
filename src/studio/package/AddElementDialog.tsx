/**
 * Pick an extra element to add to one package section of this quote (the package itself
 * is not changed). Lists active elements that aren't already in the section.
 */
import { useMemo, useState } from 'react';
import { useActiveElements, type StudioElement } from '@/data/studioCatalog';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { FormAlert } from '@/components/ui/FormAlert';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { Icon } from '@/components/ui/Icon';
import { formatINR } from '@/lib/money';

interface Props {
  packageName: string;
  existingIds: Set<string>;
  onPick: (el: StudioElement) => void;
  onClose: () => void;
}

export function AddElementDialog({ packageName, existingIds, onPick, onClose }: Props) {
  const elements = useActiveElements(true);
  const [search, setSearch] = useState('');
  const options = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (elements.data ?? []).filter((e) => !existingIds.has(e.id) && (!term || e.name.toLowerCase().includes(term)));
  }, [elements.data, existingIds, search]);

  return (
    <Modal title={`Add an element to ${packageName}`} description="Only this quote changes — the package stays as it is." onClose={onClose}>
      <label className="relative mb-4 block">
        <span className="sr-only">Search elements</span>
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search elements"
          className="w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </label>
      {elements.isLoading ? (
        <Spinner label="Loading elements…" />
      ) : elements.isError ? (
        <FormAlert>We couldn't load the elements. Please try again.</FormAlert>
      ) : options.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {search ? 'No elements match.' : 'Every element is already in this package.'}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100" aria-label="Elements to add">
          {options.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <ImageThumb bucket="element-images" path={e.image_path} alt="" size={40} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{e.name}</p>
                  <p className="num text-xs text-slate-500">
                    {formatINR(e.default_rate)}
                    {e.unit && ` / ${e.unit}`}
                  </p>
                  {e.remarks && <p className="truncate text-xs text-slate-500 italic">{e.remarks}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPick(e)}
                className="shrink-0 rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                aria-label={`Add ${e.name}`}
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
