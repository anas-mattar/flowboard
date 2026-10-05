import { useBoard } from '../../hooks/useBoard';
import { BoardMenu } from './BoardMenu';
import { BoardStar } from './BoardStar';
import { BoardTitle } from './BoardTitle';

export interface BoardTitleBarProps {
  boardId: string;
}

/**
 * Composes the title field, star toggle and board menu for the top bar's
 * `titleSlot` (FS §4.2, FB-04 spec §5). Reads the same hydrated-board cache
 * the board route's `beforeLoad` already populated, so this never issues an
 * extra request.
 */
export function BoardTitleBar({ boardId }: BoardTitleBarProps) {
  const boardQuery = useBoard(boardId);
  const data = boardQuery.data;

  if (!data) {
    return null;
  }

  return (
    <div className="board-title-bar">
      <BoardTitle board={data.board} />
      <BoardStar boardId={data.board.id} starred={data.starred} />
      <BoardMenu board={data.board} />
    </div>
  );
}
