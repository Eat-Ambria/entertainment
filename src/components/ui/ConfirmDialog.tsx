/**
 * Confirmation before an important action (archive, cancel, void…).
 */
import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, tone = 'danger', onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      size="sm"
      locked={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-slate-600">{body}</div>
    </Modal>
  );
}
