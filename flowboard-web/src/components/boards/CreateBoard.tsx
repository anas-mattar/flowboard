import { useNavigate } from '@tanstack/react-router';
import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/primitives/ToastProvider';
import { useCreateBoard } from '../../hooks/useBoards';
import { messages } from '../../i18n/messages';
import { markBoardTitleForFocus } from '../../lib/board-title-focus';

const BOARD_NAME_MAX_LENGTH = 120;

export interface CreateBoardProps {
  /**
   * Renders the text input immediately instead of the "+ Create board"
   * button (FB-04 spec §4 item 15, the empty-workspace state). The sidebar
   * use (default) starts collapsed as a button.
   */
  autoStart?: boolean;
}

/**
 * Inline "Create board" form (FS §4.1, CL-E6: no `prompt()`). Enter creates
 * and navigates to the new board; Esc cancels back to the button (sidebar
 * variant); an empty name is refused inline, never as a toast.
 */
export function CreateBoard({ autoStart = false }: CreateBoardProps) {
  const [editing, setEditing] = useState(autoStart);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createBoard = useCreateBoard();

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  const previousEditingRef = useRef(editing);
  useEffect(() => {
    // Moves focus back to "+ Create board" after Esc or an empty-value
    // blur collapses the form (FS X-03) — deferred to an effect because the
    // button isn't mounted yet at the moment `cancel()` runs.
    if (previousEditingRef.current && !editing) {
      startButtonRef.current?.focus();
    }
    previousEditingRef.current = editing;
  }, [editing]);

  function reset() {
    setEditing(autoStart);
    setValue('');
    setError(undefined);
  }

  function cancel() {
    if (autoStart) {
      // No button to fall back to: clear the field and keep it open.
      setValue('');
      setError(undefined);
      return;
    }
    setEditing(false);
    setValue('');
    setError(undefined);
  }

  function submit() {
    const trimmed = value.trim();
    if (trimmed === '') {
      setError(messages.boards.create.required);
      return;
    }
    setError(undefined);
    createBoard.mutate(
      { name: trimmed },
      {
        onSuccess: (hydrated) => {
          reset();
          markBoardTitleForFocus(hydrated.board.id);
          showToast(messages.boards.toast.created, 'success');
          void navigate({ to: '/boards/$boardId', params: { boardId: hydrated.board.id } });
        },
        onError: () => {
          showToast(messages.boards.toast.failed, 'danger');
        },
      },
    );
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      cancel();
    }
  }

  function handleBlur() {
    if (value.trim() === '') {
      cancel();
    }
  }

  if (!editing) {
    return (
      <button
        ref={startButtonRef}
        type="button"
        className="board-list__create-start"
        onClick={() => {
          setEditing(true);
        }}
      >
        + {messages.boards.create.label}
      </button>
    );
  }

  return (
    <form className="board-list__create-form" onSubmit={handleFormSubmit}>
      <label htmlFor="create-board-name" className="visually-hidden">
        {messages.boards.title.label}
      </label>
      <input
        ref={inputRef}
        id="create-board-name"
        type="text"
        className="board-list__create-input"
        placeholder={messages.boards.create.placeholder}
        maxLength={BOARD_NAME_MAX_LENGTH}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'create-board-name-error' : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) {
            setError(undefined);
          }
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      <button type="submit" className="board-list__create-submit" disabled={createBoard.isPending}>
        {messages.boards.create.submit}
      </button>
      {error ? (
        <p id="create-board-name-error" role="alert" className="board-list__create-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
