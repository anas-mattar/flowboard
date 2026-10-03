import { useQueryClient } from '@tanstack/react-query';
import { Link, createRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { FormEvent, KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { signupRequestSchema } from '@flowboard/shared';
import { describeAuthError } from '../api/auth-error';
import { signup } from '../api/auth';
import { FormField } from '../components/FormField';
import { PasswordField } from '../components/PasswordField';
import { ServerErrorBanner } from '../components/ServerErrorBanner';
import { meQueryKey, meQueryOptions } from '../hooks/useSession';
import { messages } from '../i18n/messages';
import { resolveValidationMessage } from '../i18n/validation';
import { rootRoute } from './root';

interface SignupValues {
  displayName: string;
  email: string;
  password: string;
}

type SignupFieldErrors = Partial<Record<keyof SignupValues, string>>;

const FIELD_ORDER = ['displayName', 'email', 'password'] as const;

function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SignupValues>({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<SignupFieldErrors>({});
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const fieldRefs = {
    displayName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    fieldRefs.displayName.current?.focus();
  }, []);

  function validateField(field: keyof SignupValues, value: string): string | undefined {
    const result = signupRequestSchema.shape[field].safeParse(value);
    return result.success
      ? undefined
      : resolveValidationMessage(result.error.issues[0]?.message ?? '');
  }

  function handleBlur(field: keyof SignupValues) {
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

    const parsed = signupRequestSchema.safeParse({
      displayName: values.displayName,
      email: values.email,
      password: values.password,
    });

    if (!parsed.success) {
      const nextErrors: SignupFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'displayName' || field === 'email' || field === 'password') {
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
      await signup(parsed.data);
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
        <h1 className="auth-card__title">{messages.auth.signup.title}</h1>
        <ServerErrorBanner message={serverError} />
        <FormField
          ref={fieldRefs.displayName}
          id="signup-display-name"
          label={messages.auth.signup.displayName}
          value={values.displayName}
          autoComplete="name"
          onChange={(value) => {
            setValues((current) => ({ ...current, displayName: value }));
          }}
          onBlur={() => {
            handleBlur('displayName');
          }}
          error={errors.displayName}
        />
        <FormField
          ref={fieldRefs.email}
          id="signup-email"
          label={messages.auth.signup.email}
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
          id="signup-password"
          label={messages.auth.signup.password}
          value={values.password}
          autoComplete="new-password"
          onChange={(value) => {
            setValues((current) => ({ ...current, password: value }));
          }}
          onBlur={() => {
            handleBlur('password');
          }}
          error={errors.password}
        />
        <button type="submit" className="auth-card__submit" disabled={submitting}>
          {messages.auth.signup.submit}
        </button>
        <Link to="/login" className="auth-card__link">
          {messages.auth.signup.haveAccount}
        </Link>
      </form>
    </main>
  );
}

export const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  beforeLoad: async ({ context }) => {
    const hasSession = await context.queryClient
      .ensureQueryData(meQueryOptions())
      .then(() => true)
      .catch(() => false);
    if (hasSession) {
      redirect({ to: '/', throw: true });
    }
  },
  component: SignupPage,
});
