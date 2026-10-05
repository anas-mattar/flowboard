import { Link, useParams } from '@tanstack/react-router';
import type { BoardSummary } from '@flowboard/shared';
import { useBoards } from '../../hooks/useBoards';
import { messages } from '../../i18n/messages';
import { CreateBoard } from './CreateBoard';

/**
 * Sidebar board list (FS B-01, FB-04 spec §5): starred boards grouped first
 * under a visually hidden "Starred" heading and a text ★ marker (not colour
 * alone, FS §8), then the rest in the order the API already returns
 * (case-insensitive name, FB-04 §6) — grouping is done here by `starred`
 * without re-sorting either group.
 */
export function BoardList() {
  const boardsQuery = useBoards();
  const activeBoardId = useParams({
    strict: false,
    select: (params: { boardId?: string }) => params.boardId,
  });

  const items = boardsQuery.data?.items ?? [];
  const starred = items.filter((board) => board.starred);
  const rest = items.filter((board) => !board.starred);

  return (
    <div className="board-list">
      {starred.length > 0 ? (
        <div className="board-list__group">
          <h2 className="visually-hidden">{messages.boards.starred}</h2>
          <ul className="board-list__rows">
            {starred.map((board) => (
              <BoardRow key={board.id} board={board} active={board.id === activeBoardId} />
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="board-list__rows">
        {rest.map((board) => (
          <BoardRow key={board.id} board={board} active={board.id === activeBoardId} />
        ))}
      </ul>
      <CreateBoard />
    </div>
  );
}

function BoardRow({ board, active }: { board: BoardSummary; active: boolean }) {
  return (
    <li>
      <Link
        to="/boards/$boardId"
        params={{ boardId: board.id }}
        className="board-row"
        aria-current={active ? 'page' : undefined}
        title={board.name}
      >
        <span
          className="board-row__swatch"
          aria-hidden="true"
          style={{ backgroundColor: board.color }}
        />
        {board.starred ? (
          <span className="board-row__star" aria-hidden="true">
            &#9733;
          </span>
        ) : null}
        <span className="board-row__name">{board.name}</span>
        <span className="board-row__count">{board.cardCount}</span>
      </Link>
    </li>
  );
}
