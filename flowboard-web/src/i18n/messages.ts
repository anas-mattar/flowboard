/**
 * Message catalogue (STANDARDS §1.6, FS §8 internationalisation). Every
 * user-visible string in flowboard-web is added here, never inline in a
 * component. No translations ship in MVP (CL-E7), but the catalogue is the
 * only place text appears. Keys match the catalogue in the FB-02 spec §5.
 */
export const messages = {
  appName: 'FlowBoard',
  app: {
    signedInAs: (name: string): string => `Signed in as ${name}`,
  },
  auth: {
    signup: {
      title: 'Create your account',
      displayName: 'Display name',
      email: 'Email',
      password: 'Password',
      submit: 'Create account',
      haveAccount: 'Already have an account? Sign in',
    },
    login: {
      title: 'Sign in',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      noAccount: 'New here? Create an account',
    },
    error: {
      invalidCredentials: 'Email or password is incorrect',
      emailTaken: 'That email address is already registered',
      rateLimited: (minutes: number): string =>
        `Too many attempts. Try again in ${String(minutes)} minute${minutes === 1 ? '' : 's'}.`,
      network: 'Could not reach the server. Check your connection and try again.',
    },
    password: {
      show: 'Show password',
      hide: 'Hide password',
    },
    signOut: 'Sign out',
  },
  workspace: {
    defaultName: (name: string): string => `${name}'s workspace`,
  },
  validation: {
    email: 'Enter a valid email address.',
    passwordLength: 'Password must be 10 to 128 characters.',
    required: 'This field is required.',
    tooLong: 'That value is too long.',
  },
} as const;

export type MessageKey = keyof typeof messages;
