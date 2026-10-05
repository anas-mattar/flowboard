import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { makeBoardHydrated, makeBoardSummary, makeMeResponse } from '../../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../../test/mock-fetch';
import { renderApp } from '../../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function setUp() {
  const me = makeMeResponse();
  const existing = makeBoardSummary({ name: 'Existing' });
  const hydrated = makeBoardHydrated({
    board: { ...makeBoardHydrated().board, id: existing.id, name: existing.name },
  });
  mockFetchSequence(
    jsonResponse(200, me),
    jsonResponse(200, hydrated),
    jsonResponse(200, { items: [existing], nextCursor: null }),
  );

  const utils = renderApp(`/boards/${existing.id}`);
  const startButton = await screen.findByRole('button', {
    name: `+ ${messages.boards.create.label}`,
  });
  return { ...utils, startButton };
}

describe('CreateBoard (FS §4.1, B-02, CL-E6, FB-04 spec AC 10)', () => {
  it('Enter creates the board and navigates to it, showing the created toast', async () => {
    const { startButton, router } = await setUp();
    fireEvent.click(startButton);

    const input = screen.getByPlaceholderText(messages.boards.create.placeholder);
    fireEvent.change(input, { target: { value: 'New Board' } });

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const created = makeBoardHydrated({
      board: { ...makeBoardHydrated().board, id: 'new-board-id', name: 'New Board' },
    });
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(201, created)));
    // The sidebar's `useBoards()` is invalidated on create success and
    // refetches in the background (it's an active query) — queue its
    // response too so that refetch doesn't reject.
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        jsonResponse(200, {
          items: [
            makeBoardSummary({ name: 'Existing' }),
            { ...created.board, starred: false, cardCount: 0 },
          ],
          nextCursor: null,
        }),
      ),
    );

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await screen.findByText(messages.boards.toast.created);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/boards/new-board-id');
    });
  });

  it('Esc cancels back to the "+ Create board" button', async () => {
    const { startButton } = await setUp();
    fireEvent.click(startButton);

    const input = screen.getByPlaceholderText(messages.boards.create.placeholder);
    fireEvent.change(input, { target: { value: 'Something' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `+ ${messages.boards.create.label}` }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByPlaceholderText(messages.boards.create.placeholder),
    ).not.toBeInTheDocument();
  });

  it('an empty submit shows the inline required message and sends no request', async () => {
    const { startButton } = await setUp();
    fireEvent.click(startButton);

    const input = screen.getByPlaceholderText(messages.boards.create.placeholder);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(await screen.findByText(messages.boards.create.required)).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('blur with an empty value cancels back to the button', async () => {
    const { startButton } = await setUp();
    fireEvent.click(startButton);

    const input = screen.getByPlaceholderText(messages.boards.create.placeholder);
    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `+ ${messages.boards.create.label}` }),
      ).toBeInTheDocument();
    });
  });
});
