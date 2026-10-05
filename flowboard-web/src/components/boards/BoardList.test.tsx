import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messages } from '../../i18n/messages';
import { makeBoardHydrated, makeBoardSummary, makeMeResponse } from '../../test/fixtures';
import { jsonResponse, mockFetchSequence } from '../../test/mock-fetch';
import { renderApp } from '../../test/render-app';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BoardList (FS B-01, FB-04 spec AC 9)', () => {
  it('groups starred boards first, marks the active row, and renders the swatch and count', async () => {
    const me = makeMeResponse();
    const active = makeBoardSummary({ name: 'Active Board', starred: true, cardCount: 2 });
    const starredOther = makeBoardSummary({
      name: 'Another Starred',
      starred: true,
      cardCount: 5,
    });
    const plainA = makeBoardSummary({ name: 'Alpha Plain', starred: false, cardCount: 0 });
    const plainB = makeBoardSummary({ name: 'Zulu Plain', starred: false, cardCount: 7 });
    const board = makeBoardHydrated({
      board: { ...makeBoardHydrated().board, id: active.id, name: active.name },
      starred: true,
    });

    mockFetchSequence(
      jsonResponse(200, me),
      jsonResponse(200, board),
      jsonResponse(200, { items: [active, starredOther, plainA, plainB], nextCursor: null }),
    );

    renderApp(`/boards/${active.id}`);

    await screen.findByText('Another Starred');

    const sidebar = screen.getByRole('navigation', { name: messages.app.name });
    const starredHeading = within(sidebar).getByRole('heading', { name: 'Starred', level: 2 });
    expect(starredHeading).toHaveClass('visually-hidden');

    const links = within(sidebar).getAllByRole('link');
    const names = links.map(
      (link) => link.querySelector('.board-row__name')?.textContent ?? link.textContent,
    );
    expect(names).toEqual(['Active Board', 'Another Starred', 'Alpha Plain', 'Zulu Plain']);

    const activeLink = within(sidebar).getByRole('link', { name: /Active Board/ });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
    const otherLink = within(sidebar).getByRole('link', { name: /Alpha Plain/ });
    expect(otherLink).not.toHaveAttribute('aria-current');

    const swatch = activeLink.querySelector('.board-row__swatch');
    expect(swatch).toHaveAttribute('aria-hidden', 'true');

    const zuluLink = within(sidebar).getByRole('link', { name: /Zulu Plain/ });
    expect(zuluLink.querySelector('.board-row__count')).toHaveTextContent('7');

    await waitFor(() => {
      expect(screen.getByText(me.user.displayName)).toBeInTheDocument();
    });
  });
});
