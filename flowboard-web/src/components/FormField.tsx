import { forwardRef } from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
  autoComplete?: string;
  /** Rendered after the input, inside the same control row (the password show/hide button). */
  trailing?: React.ReactNode;
}

/**
 * A labelled input with its error linked by `aria-describedby` (FS §8,
 * FB-02 spec §4 item 14). Every signup and login field uses this so the
 * accessible wiring only has to be right once.
 */
export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { id, label, type = 'text', value, onChange, onBlur, error, autoComplete, trailing },
  ref,
) {
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <label htmlFor={id} className="form-field__label">
        {label}
      </label>
      <div className="form-field__control">
        <input
          ref={ref}
          id={id}
          name={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onBlur={onBlur}
          className="form-field__input"
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="form-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
});
