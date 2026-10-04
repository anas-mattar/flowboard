import { useId, useRef } from 'react';
import { messages } from '../../i18n/messages';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Destructive confirmation (CL-E6: no `confirm()`; FB-03 spec §3, acceptance
 * criterion 8). Never closes on scrim click; the destructive action requires
 * an explicit click or `Enter` on the confirm button.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = messages.dialog.confirm,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onClose={onClose} titleId={titleId} closeOnScrim={false}>
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      <p className="dialog__body">{body}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          {messages.dialog.cancel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          className="btn btn--danger"
          onClick={() => {
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
