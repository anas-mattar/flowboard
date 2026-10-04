import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog';

function Harness({ closeOnScrim = true }: { closeOnScrim?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        titleId="dialog-title"
        closeOnScrim={closeOnScrim}
      >
        <h2 id="dialog-title">Title</h2>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>
    </div>
  );
}

describe('Dialog (FS X-03, FS §8, acceptance criterion 8)', () => {
  it('traps focus: Tab from the last control wraps to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on Esc and returns focus to the opener', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    // jsdom's fireEvent.click does not move focus like a real click does;
    // focus it explicitly so the dialog captures a realistic "opener".
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('closes on scrim click when closeOnScrim is true', () => {
    render(<Harness closeOnScrim />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not close on scrim click when closeOnScrim is false (ConfirmDialog)', () => {
    render(<Harness closeOnScrim={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
