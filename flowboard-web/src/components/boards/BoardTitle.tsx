import { useQueryClient } from '@tanstack/react-query';
import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Board } from '@flowboard/shared';
import { ApiClientError } from '../../api/client';
import { boardQueryKey, useUpdateBoard } from '../../hooks/useBoard';
import { messages } from '../../i18n/messages';
import { consumeBoardTitleFocus } from '../../lib/board-title-focus';
import { useToast } from '../primitives/ToastProvider';

const BOARD_NAME_MAX_LENGTH = 120;

export interface BoardTitleProps {
  board: Board;
}

/**
 * Inline-editable board title (FS §4.2, B-03, FB-04 spec §5): Enter blurs
 * and persists the trimmed value; blur also persists; Esc reverts without
 * sending a request; an empty value reverts the same way. A `409` re-fetches
 * the board instead of trusting the rolled-back cache (FS §7.1, CL-E18).
 */
export function BoardTitle({ board }: BoardTitleProps) {
  const [value, setValue] = useState(board.name);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelingRef = useRef(false);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const updateBoard = useUpdateBoard(board.id);

  // Picks up the server's name after a rollback or a post-409 refetch, but
  // never while the user is mid-edit (that would clobber their typing).
  // Tracked via a React-level focus flag rather than `document.activeElement`
  // so it reacts the same way to a real browser blur and to a simulated one.
  useEffect(() => {
    if (!isFocused) {
      setValue(board.name);
    }
  }, [board.name, isFocused]);

  useEffect(() => {
    if (consumeBoardTitleFocus(board.id)) {
      inputRef.current?.focus();
    }
    // Only ever re-run if a *different* board mounts into this slot.
  }, [board.id]);

  function persist() {
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === board.name) {
      setValue(board.name);
      return;
    }
    updateBoard.mutate(
      { patch: { name: trimmed }, ifMatch: board.updatedAt },
      {
        onSuccess: () => {
          showToast(messages.boards.toast.renamed, 'success');
        },
        onError: (error) => {
          if (error instanceof ApiClientError && error.code === 'stale') {
            void queryClient.invalidateQueries({ queryKey: boardQueryKey(board.id) });
            showToast(messages.boards.toast.conflict, 'danger');
          } else {
            showToast(messages.boards.toast.failed, 'danger');
          }
        },
      },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      inputRef.current?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelingRef.current = true;
      setValue(board.name);
      inputRef.current?.blur();
    }
  }

  function handleFocus() {
    setIsFocused(true);
  }

  function handleBlur() {
    setIsFocused(false);
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    persist();
  }

  return (
    <div className="board-title">
      <label htmlFor="board-title-input" className="visually-hidden">
        {messages.boards.title.label}
      </label>
      <input
        ref={inputRef}
        id="board-title-input"
        className="board-title__input"
        type="text"
        maxLength={BOARD_NAME_MAX_LENGTH}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </div>
  );
}
