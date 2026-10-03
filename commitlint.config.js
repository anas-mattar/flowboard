/**
 * Conventional Commits, STANDARDS §1.7.
 * Types are restricted to the list the standard names.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'ci', 'perf', 'revert'],
    ],
    // STANDARDS §1.7 writes subjects as `feat(api): FB-04 board hydration`, so a
    // subject may start with an upper-case backlog ID.
    'subject-case': [0, 'always'],
    // STANDARDS §1.7 constrains the subject line only. Commit bodies and footers
    // carry wrapped prose, pasted command output and long URLs, so the
    // conventional 100-character wrap is not enforced on them.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};
