import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './ToastProvider';

function Trigger({ message }: { message: string }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        showToast(message);
      }}
    >
      Show
    </button>
  );
}

function renderWithProvider(message = 'Board archived') {
  return render(
    <ToastProvider>
      <Trigger message={message} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast (FS X-01, acceptance criterion 7)', () => {
  it('renders within 200 ms of being called', () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText('Board archived')).toBeInTheDocument();
  });

  it('is announced via a polite live region', () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('auto-dismisses after 4 seconds', () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Board archived')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Board archived')).not.toBeInTheDocument();
  });

  it('pauses the dismiss timer on hover and resumes on mouse leave', () => {
    renderWithProvider();
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    const toast = screen.getByText('Board archived').closest('.toast') as HTMLElement;

    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Board archived')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Board archived')).not.toBeInTheDocument();
  });

  it('stacks at most 3 toasts, dropping the oldest', () => {
    renderWithProvider();
    const button = screen.getByRole('button', { name: 'Show' });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getAllByText('Board archived')).toHaveLength(3);
  });
});
