import { useUpdateBoard } from '../../hooks/useBoard';
import { messages } from '../../i18n/messages';
import { useToast } from '../primitives/ToastProvider';

export interface BoardStarProps {
  boardId: string;
  starred: boolean;
}

/**
 * Star toggle (FS §4.2, B-04, CL-E14): never sends `If-Match` — starring is
 * per-user and does not bump the board's `updatedAt` (FB-04 §6).
 */
export function BoardStar({ boardId, starred }: BoardStarProps) {
  const { showToast } = useToast();
  const updateBoard = useUpdateBoard(boardId);

  function toggle() {
    const nextStarred = !starred;
    updateBoard.mutate(
      { patch: { starred: nextStarred } },
      {
        onSuccess: () => {
          showToast(
            nextStarred ? messages.boards.toast.starred : messages.boards.toast.unstarred,
            'success',
          );
        },
        onError: () => {
          showToast(messages.boards.toast.failed, 'danger');
        },
      },
    );
  }

  return (
    <button
      type="button"
      className="icon-btn board-star"
      aria-pressed={starred}
      aria-label={starred ? messages.boards.unstar : messages.boards.star}
      onClick={toggle}
    >
      <span aria-hidden="true">{starred ? '★' : '☆'}</span>
    </button>
  );
}
