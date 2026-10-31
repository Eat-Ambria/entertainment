/**
 * Tiny toast store: toast.success('Saved') from anywhere; <Toaster/> renders them.
 */
export interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(tone: ToastItem['tone'], message: string, ms = 3500) {
  const id = nextId++;
  items = [...items, { id, tone, message }];
  emit();
  setTimeout(() => dismiss(id), ms);
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 6000),
};

export const toastStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot: () => items,
};
