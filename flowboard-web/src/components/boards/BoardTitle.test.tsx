import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { makeBoardHydrated, makeMeResponse } from '../../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../../test/mock-fetch';
import { renderApp } from '../../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

function boardsPage() {
  return jsonResponse(200, { items: [], nextCursor: null });
}

async function setUp(boardOverrides: Partial<ReturnType<typeof makeBoardHydrated>> = {}) {
  const me = makeMeResponse();
  const hydrated = makeBoardHydrated(boardOverrides);
  mockFetchSequence(jsonResponse(200, me), jsonResponse(200, hydrated), boardsPage());

  renderApp(`/boards/${hydrated.board.id}`);
  const input = await screen.findByLabelText<HTMLInputElement>(messages.boards.title.label);
  // Real focus (not just `fireEvent.change`) so `Enter`/`Esc`'s imperative
  // `inputRef.current?.blur()` actually fires a blur event in jsdom.
  input.focus();
  return { hydrated, input };
}

describe('BoardTitle (FS §4.2, B-03, FB-04 spec AC 11)', () => {
  it('Enter persists the trimmed value and shows the renamed toast', async () => {
    const { hydrated, input } = await setUp();

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(200, { ...hydrated.board, starred: false, cardCount: 0, name: 'Renamed' }),
      ),
    );

    fireEvent.change(input, { target: { value: '  Renamed  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await screen.findByText(messages.boards.toast.renamed);
    await waitFor(() => {
      expect(input).toHaveValue('Renamed');
    });
  });

  it('blur persists the trimmed value', async () => {
    const { hydrated, input } = await setUp();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(200, { ...hydrated.board, starred: false, cardCount: 0, name: 'Renamed' }),
      ),
    );

    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.blur(input);

    await screen.findByText(messages.boards.toast.renamed);
  });

  it('Esc reverts without sending a request', async () => {
    const { hydrated, input } = await setUp();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.change(input, { target: { value: 'Not saved' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(input).toHaveValue(hydrated.board.name);
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('an empty value reverts without sending a request', async () => {
    const { hydrated, input } = await setUp();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(input).toHaveValue(hydrated.board.name);
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('a 409 re-fetches the board and shows the conflict toast', async () => {
    const { hydrated, input } = await setUp();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(409, { error: { code: 'stale', message: 'Stale' } })),
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(200, { ...hydrated, board: { ...hydrated.board, name: 'Latest' } }),
      ),
    );

    fireEvent.change(input, { target: { value: 'My Edit' } });
    fireEvent.blur(input);

    await screen.findByText(messages.boards.toast.conflict);
    await waitFor(() => {
      expect(input).toHaveValue('Latest');
    });
  });

  it('a non-conflict error rolls back and shows the failed toast', async () => {
    const { hydrated, input } = await setUp();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(500, { error: { code: 'internal_error', message: 'Boom' } })),
    );

    fireEvent.change(input, { target: { value: 'My Edit' } });
    fireEvent.blur(input);

    await screen.findByText(messages.boards.toast.failed);
    await waitFor(() => {
      expect(input).toHaveValue(hydrated.board.name);
    });
  });
});
