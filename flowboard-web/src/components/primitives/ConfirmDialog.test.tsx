import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { ConfirmDialog } from './ConfirmDialog';

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      title="Archive this board?"
      body="This can be undone from the archive."
      onConfirm={onConfirm}
      onClose={() => {
        setOpen(false);
      }}
    />
  );
}

describe('ConfirmDialog (CL-E6, acceptance criterion 8)', () => {
  it('does not close on scrim click', () => {
    render(<Harness onConfirm={() => undefined} />);
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('requires an explicit click on the destructive confirm button', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: messages.dialog.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancel closes without confirming', () => {
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: messages.dialog.cancel }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
