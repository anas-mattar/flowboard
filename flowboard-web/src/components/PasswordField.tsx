import { forwardRef, useState } from 'react';
import { messages } from '../i18n/messages';
import { FormField } from './FormField';

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: (() => void) | undefined;
  error?: string | undefined;
  autoComplete: string;
}

/**
 * A password input with a show/hide toggle labelled for screen readers
 * (FB-02 spec §5). The toggle is `type="button"` so it never submits the
 * form.
 */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField({ id, label, value, onChange, onBlur, error, autoComplete }, ref) {
    const [visible, setVisible] = useState(false);

    return (
      <FormField
        ref={ref}
        id={id}
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        error={error}
        autoComplete={autoComplete}
        trailing={
          <button
            type="button"
            className="form-field__toggle"
            aria-label={visible ? messages.auth.password.hide : messages.auth.password.show}
            onClick={() => {
              setVisible((current) => !current);
            }}
          >
            {visible ? messages.auth.password.hide : messages.auth.password.show}
          </button>
        }
      />
    );
  },
);
