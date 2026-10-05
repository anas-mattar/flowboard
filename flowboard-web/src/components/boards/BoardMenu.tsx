import { useNavigate } from '@tanstack/react-router';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Board } from '@flowboard/shared';
import { useBoards } from '../../hooks/useBoards';
import { useUpdateBoard } from '../../hooks/useBoard';
import { useShortcut } from '../../hooks/useShortcut';
import { messages } from '../../i18n/messages';
import { ConfirmDialog } from '../primitives/ConfirmDialog';
import { useToast } from '../primitives/ToastProvider';

export interface BoardMenuProps {
  board: Board;
}

/**
 * Board menu (FS §4.2, B-06, CL-A11): one destructive item, "Archive board",
 * behind `ConfirmDialog`. Same arrow-key menu pattern as `UserMenu`.
 */
export function BoardMenu({ board }: BoardMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const boardsQuery = useBoards();
  const { showToast } = useToast();
  const updateBoard = useUpdateBoard(board.id);

  useShortcut(
    'Escape',
    () => {
      setOpen(false);
      buttonRef.current?.focus();
    },
    open,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function focusSidebarAfterArchive() {
    // The sidebar (`BoardList`) stays mounted across this navigation, so the
    // new state only exists after the next render; deferred one tick so the
    // archived row has already been removed (FB-04 spec §5 "Focus
    // behaviour").
    setTimeout(() => {
      const firstRow = document.querySelector<HTMLElement>('.sidebar .board-row');
      if (firstRow) {
        firstRow.focus();
      } else {
        document.querySelector<HTMLElement>('.board-list__create-start')?.focus();
      }
    }, 0);
  }

  function handleArchive() {
    setConfirmOpen(false);
    const items = boardsQuery.data?.items ?? [];
    const nextId = items.find((item) => item.id !== board.id)?.id;

    updateBoard.mutate(
      { patch: { archived: true }, ifMatch: board.updatedAt },
      {
        onSuccess: () => {
          showToast(messages.boards.toast.archived, 'success');
          void navigate(
            nextId ? { to: '/boards/$boardId', params: { boardId: nextId } } : { to: '/' },
          ).then(focusSidebarAfterArchive);
        },
        onError: () => {
          showToast(messages.boards.toast.failed, 'danger');
        },
      },
    );
  }

  return (
    <div className="board-menu">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={messages.boards.actions}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true">&#8942;</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="board-menu__popover"
          role="menu"
          aria-label={messages.boards.actions}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            className="board-menu__item board-menu__item--danger"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
          >
            {messages.boards.archive.label}
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmOpen}
        title={messages.boards.archive.confirmTitle(board.name)}
        body={messages.boards.archive.confirmBody}
        confirmLabel={messages.boards.archive.confirm}
        onConfirm={handleArchive}
        onClose={() => {
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
