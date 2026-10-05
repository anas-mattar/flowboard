/**
 * Message catalogue (STANDARDS §1.6, FS §8 internationalisation). Every
 * user-visible string in flowboard-web is added here, never inline in a
 * component. No translations ship in MVP (CL-E7), but the catalogue is the
 * only place text appears. Keys match the catalogue in the FB-02 spec §5.
 */
export const messages = {
  app: {
    name: 'FlowBoard',
    skipToContent: 'Skip to content',
    signedInAs: (name: string): string => `Signed in as ${name}`,
  },
  shell: {
    toggleSidebar: 'Toggle sidebar',
    boards: 'Boards',
    theme: {
      label: 'Theme',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
    },
    comingSoon: 'Coming soon',
    search: 'Search',
    filter: 'Filter',
    members: 'Board members',
    invite: 'Invite',
    userMenu: 'User menu',
  },
  role: {
    workspaceAdmin: 'Workspace admin',
    member: 'Member',
  },
  dialog: {
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
  toast: {
    dismiss: 'Dismiss',
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
  /*
   * FB-04 §5 catalogue. The spec writes these as dotted keys
   * (`boards.create.placeholder`, ...); nested here the same way every other
   * namespace in this file is, since `boards.create` also needs to be a
   * plain button label ("+ Create board") and cannot be both a string and an
   * object at the same path — `create.label` carries that string instead.
   */
  boards: {
    create: {
      label: 'Create board',
      placeholder: 'Board name',
      submit: 'Create',
      required: 'Enter a board name.',
    },
    starred: 'Starred',
    title: {
      label: 'Board name',
    },
    star: 'Star board',
    unstar: 'Unstar board',
    actions: 'Board actions',
    archive: {
      label: 'Archive board',
      confirmTitle: (name: string): string => `Archive '${name}'?`,
      confirmBody: 'You can restore it from archived items for 30 days.',
      confirm: 'Archive board',
    },
    empty: {
      title: 'No boards yet',
      body: 'Create your first board to start organising work.',
    },
    toast: {
      created: 'Board created',
      renamed: 'Board renamed',
      archived: 'Board archived',
      starred: 'Board starred',
      unstarred: 'Board unstarred',
      conflict: 'This board was changed elsewhere, showing the latest',
      failed: 'Board failed to update',
    },
  },
  lists: {
    empty: 'No cards yet',
    wipPill: (count: number, limit: number): string => `${String(count)} / ${String(limit)}`,
  },
} as const;

export type MessageKey = keyof typeof messages;
