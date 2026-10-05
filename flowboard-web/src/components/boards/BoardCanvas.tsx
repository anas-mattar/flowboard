import { useBoard } from '../../hooks/useBoard';
import { messages } from '../../i18n/messages';

export interface BoardCanvasProps {
  boardId: string;
}

/**
 * Read-only board canvas (FS §4.4, §4.5, CL-A7): the three default lists as
 * 286px columns in position order, each with a name and a `count / WIP`
 * pill (or a bare count with no limit). Lists and cards are FB-05/FB-06; no
 * add-list or add-card affordance here.
 */
export function BoardCanvas({ boardId }: BoardCanvasProps) {
  const boardQuery = useBoard(boardId);
  const lists = boardQuery.data?.lists ?? [];

  return (
    <div className="board-canvas">
      {lists.map((list) => (
        <section key={list.id} className="board-list-column" aria-label={list.name}>
          <header className="board-list-column__header">
            <h2 className="board-list-column__name">{list.name}</h2>
            <span className="board-list-column__pill">
              {list.wipLimit !== null
                ? messages.lists.wipPill(list.cards.length, list.wipLimit)
                : list.cards.length}
            </span>
          </header>
          <div className="board-list-column__body">
            {list.cards.length === 0 ? (
              <p className="board-list-column__empty">{messages.lists.empty}</p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
