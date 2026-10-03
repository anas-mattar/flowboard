import { useQueryClient } from '@tanstack/react-query';
import { Link, createRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { loginRequestSchema } from '@flowboard/shared';
import { login } from '../api/auth';
import { describeAuthError } from '../api/auth-error';
import { FormField } from '../components/FormField';
import { PasswordField } from '../components/PasswordField';
import { ServerErrorBanner } from '../components/ServerErrorBanner';
import { meQueryKey, meQueryOptions } from '../hooks/useSession';
import { messages } from '../i18n/messages';
import { resolveValidationMessage } from '../i18n/validation';
import { rootRoute } from './root';

interface LoginValues {
  email: string;
  password: string;
}

type LoginFieldErrors = Partial<Record<keyof LoginValues, string>>;

const FIELD_ORDER = ['email', 'password'] as const;

function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const fieldRefs = {
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fieldRefs.email.current?.focus();
  }, []);

  useEffect(() => {
    if (serverError && !submitting) {
      submitRef.current?.focus();
    }
  }, [serverError, submitting]);

  function validateField(field: keyof LoginValues, value: string): string | undefined {
    const result = loginRequestSchema.shape[field].safeParse(value);
    return result.success
      ? undefined
      : resolveValidationMessage(result.error.issues[0]?.message ?? '');
  }

  function handleBlur(field: keyof LoginValues) {
    setErrors((current) => ({ ...current, [field]: validateField(field, values[field]) }));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Escape') {
      setServerError(undefined);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(undefined);

    const parsed = loginRequestSchema.safeParse({ email: values.email, password: values.password });

    if (!parsed.success) {
      const nextErrors: LoginFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          nextErrors[field] ??= resolveValidationMessage(issue.message);
        }
      }
      setErrors(nextErrors);
      const firstInvalidField = FIELD_ORDER.find((field) => nextErrors[field]);
      if (firstInvalidField) {
        fieldRefs[firstInvalidField].current?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      queryClient.removeQueries({ queryKey: meQueryKey });
      await navigate({ to: '/' });
    } catch (error) {
      setServerError(describeAuthError(error));
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form
        className="auth-card"
        noValidate
        onKeyDown={handleKeyDown}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <h1 className="auth-card__title">{messages.auth.login.title}</h1>
        <ServerErrorBanner message={serverError} />
        <FormField
          ref={fieldRefs.email}
          id="login-email"
          label={messages.auth.login.email}
          type="email"
          value={values.email}
          autoComplete="email"
          onChange={(value) => {
            setValues((current) => ({ ...current, email: value }));
          }}
          onBlur={() => {
            handleBlur('email');
          }}
          error={errors.email}
        />
        <PasswordField
          ref={fieldRefs.password}
          id="login-password"
          label={messages.auth.login.password}
          value={values.password}
          autoComplete="current-password"
          onChange={(value) => {
            setValues((current) => ({ ...current, password: value }));
          }}
          onBlur={() => {
            handleBlur('password');
          }}
          error={errors.password}
        />
        <button ref={submitRef} type="submit" className="auth-card__submit" disabled={submitting}>
          {messages.auth.login.submit}
        </button>
        <Link to="/signup" className="auth-card__link">
          {messages.auth.login.noAccount}
        </Link>
      </form>
    </main>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient
      .ensureQueryData(meQueryOptions())
      .then(() => true)
      .catch(() => false);
    if (hasSession) {
      redirect({ to: '/', throw: true });
    }
  },
  component: LoginPage,
});
