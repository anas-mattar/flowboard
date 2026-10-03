#!/usr/bin/env node
/**
 * paperclip-git: run `git` (or `gh`, or a minimal `pr create`) with the GitHub credentials
 * that Paperclip's credential broker issues for the current agent run.
 *
 * Why this exists (Paperclip issue TAS-35): Paperclip's managed GitHub launcher is a Node
 * shebang script named `git` that resolves an extensionless `git` binary on PATH and spawns
 * it. On Windows only `git.exe` exists, so the launcher exits 127 and agents cannot push.
 * This script performs the same steps as the launcher, with the platform executable
 * extension taken into account, and never prints the credential it obtains.
 *
 * Usage (from any checkout of this repository):
 *   node tools/paperclip-git.cjs push -u origin <branch>
 *   node tools/paperclip-git.cjs fetch origin
 *   node tools/paperclip-git.cjs gh pr list                     (only if gh is installed)
 *   node tools/paperclip-git.cjs pr create --title "<title>" --body-file <file> \
 *        --head <branch> [--base main] [--draft] [--repo owner/name]
 *
 * The first argument selects the program: `git` (default when omitted), `gh`, or the built-in
 * `pr create` command, which calls the GitHub REST API so that pull requests can be opened on
 * hosts without the gh CLI.
 *
 * Credentials come from the broker named by PAPERCLIP_GITHUB_BROKER_URL (or PAPERCLIP_API_URL)
 * using the capability in PAPERCLIP_GITHUB_BROKER_TOKEN. Outside a Paperclip run the script
 * still runs git, just without managed credentials, and says so on stderr.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const WINDOWS = process.platform === 'win32';
const ALLOWED_PROGRAMS = ['git', 'gh'];
const REQUEST_TIMEOUT_MS = 10_000;
const BROKER_BUSY_RETRIES = 30;

function diagnostic(message) {
  process.stderr.write(`paperclip-git: ${message}\n`);
}

/** Paths that must never be chosen as the real binary: the Paperclip launcher shim directory. */
function excludedDirectories() {
  const excluded = new Set();
  const launcherDirectory = process.env.PAPERCLIP_GITHUB_LAUNCHER_DIR;
  if (launcherDirectory) {
    try {
      excluded.add(fs.realpathSync(launcherDirectory));
    } catch {
      // Launcher directory missing: nothing to exclude.
    }
  }
  return excluded;
}

/**
 * Resolve the real executable for `program` on PATH. On Windows only `.exe` candidates are
 * accepted, because that is what Node's spawn can start and what Git for Windows installs.
 */
function resolveExecutable(program) {
  const excluded = excludedDirectories();
  const extensions = WINDOWS ? ['.exe'] : [''];
  const entries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    let realEntry;
    try {
      realEntry = fs.realpathSync(entry);
    } catch {
      continue;
    }
    if (excluded.has(realEntry)) continue;
    for (const extension of extensions) {
      const candidate = path.join(entry, program + extension);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // Not here; keep scanning.
      }
    }
  }
  return undefined;
}

/** Build the child environment: strip inherited identity and credentials like the launcher does. */
function baseEnvironment() {
  const env = { ...process.env };
  const stripped =
    /^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|PAPERCLIP_GIT_TOKEN|GIT_AUTHOR_.*|GIT_COMMITTER_.*|GIT_CONFIG_.*|GIT_ASKPASS|SSH_ASKPASS|SSH_AUTH_SOCK|GIT_SSH.*)$/;
  for (const key of Object.keys(env)) {
    if (stripped.test(key)) delete env[key];
  }
  Object.assign(env, {
    SSH_AUTH_SOCK: '',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '5',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'url.https://github.com/.insteadOf',
    GIT_CONFIG_VALUE_1: 'git@github.com:',
    GIT_CONFIG_KEY_2: 'url.https://github.com/.insteadOf',
    GIT_CONFIG_VALUE_2: 'ssh://git@github.com/',
    GIT_CONFIG_KEY_3: 'core.askPass',
    GIT_CONFIG_VALUE_3: '',
    GIT_CONFIG_KEY_4: 'user.useConfigOnly',
    GIT_CONFIG_VALUE_4: 'true',
  });
  return env;
}

/**
 * Ask the Paperclip broker for managed GitHub credentials and merge the allowed keys into env.
 * Returns true when credentials were applied. Never logs credential values.
 */
async function applyManagedCredentials(env) {
  const base = env.PAPERCLIP_GITHUB_BROKER_URL || env.PAPERCLIP_API_URL;
  const capability = env.PAPERCLIP_GITHUB_BROKER_TOKEN;
  if (!base || !capability) {
    diagnostic(
      'no Paperclip GitHub capability in this environment; running without managed credentials.',
    );
    return false;
  }
  const url = `${base.replace(/\/+$/, '').replace(/\/api$/, '')}/runtime-tools/github/credentials`;
  const bearer = env.PAPERCLIP_GITHUB_BRIDGE_TOKEN || env.PAPERCLIP_API_KEY || capability;
  let response;
  try {
    for (let attempt = 0; attempt < BROKER_BUSY_RETRIES; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${bearer}`,
          'x-paperclip-github-capability': capability,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      if (response.status !== 409) break;
      await response.arrayBuffer();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch {
    diagnostic('credential broker unreachable; running without managed credentials.');
    return false;
  }
  if (!response.ok) {
    const code =
      response.status === 401 || response.status === 403
        ? 'capability rejected'
        : `broker responded ${response.status}`;
    diagnostic(`${code}; running without managed credentials.`);
    return false;
  }
  const result = await response.json();
  if (result.status !== 'available') {
    const reason =
      typeof result.reason === 'string'
        ? // Broker text is echoed to the terminal; strip control characters deliberately.
          // eslint-disable-next-line no-control-regex
          result.reason.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 500)
        : 'check the GitHub connection in Paperclip';
    diagnostic(`GitHub access unavailable: ${reason}. Running without managed credentials.`);
    return false;
  }
  const accepted =
    /^(GH_TOKEN|GITHUB_TOKEN|PAPERCLIP_GIT_TOKEN|GIT_TERMINAL_PROMPT|GIT_AUTHOR_(NAME|EMAIL)|GIT_COMMITTER_(NAME|EMAIL)|GIT_CONFIG_COUNT|GIT_CONFIG_(KEY|VALUE)_\d+)$/;
  for (const [key, value] of Object.entries(result.env || {})) {
    if (accepted.test(key) && typeof value === 'string') env[key] = value;
  }
  return true;
}

function runProgram(program, args, env) {
  const executable = resolveExecutable(program);
  if (!executable) {
    diagnostic(`${program}${WINDOWS ? '.exe' : ''} was not found on PATH.`);
    process.exit(127);
  }
  env.GIT_SSH_COMMAND =
    'ssh -F /dev/null -o IdentityAgent=none -o IdentitiesOnly=yes -o IdentityFile=none -o BatchMode=yes';
  const child = spawn(executable, args, { env, stdio: 'inherit' });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => child.kill(signal));
  }
  child.once('error', () => {
    diagnostic(`${program} could not start.`);
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code === null ? 128 : code;
  });
}

/** Parse `--flag value` and boolean `--flag` arguments for the built-in `pr create` command. */
function parseFlags(args) {
  const flags = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      diagnostic(`unexpected argument "${arg}".`);
      process.exit(2);
    }
    const name = arg.slice(2);
    if (name === 'draft') {
      flags.draft = true;
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      diagnostic(`--${name} requires a value.`);
      process.exit(2);
    }
    flags[name] = value;
    index++;
  }
  return flags;
}

/** Derive `owner/name` from the `origin` remote of the current repository. */
function detectRepository(env) {
  const executable = resolveExecutable('git');
  if (!executable) return undefined;
  const result = spawnSync(executable, ['remote', 'get-url', 'origin'], { env, encoding: 'utf8' });
  if (result.status !== 0) return undefined;
  const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\s*$/.exec(result.stdout);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

async function createPullRequest(args, env) {
  const flags = parseFlags(args);
  const repository = flags.repo || detectRepository(env);
  const missing = ['title', 'head'].filter((name) => !flags[name]);
  if (!repository) missing.push('repo (could not derive from origin)');
  if (!flags.body && !flags['body-file']) missing.push('body or body-file');
  if (missing.length > 0) {
    diagnostic(`pr create is missing: ${missing.join(', ')}.`);
    process.exit(2);
  }
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (!token) {
    diagnostic('pr create needs managed credentials and none were available.');
    process.exit(1);
  }
  const body = flags.body ?? fs.readFileSync(flags['body-file'], 'utf8');
  const response = await fetch(`https://api.github.com/repos/${repository}/pulls`, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS * 3),
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'flowboard-paperclip-git',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      title: flags.title,
      head: flags.head,
      base: flags.base || 'main',
      body,
      draft: Boolean(flags.draft),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof payload.message === 'string' ? payload.message : 'no detail';
    const errors = Array.isArray(payload.errors)
      ? payload.errors.map((error) => error.message || error.code || '').join('; ')
      : '';
    diagnostic(
      `GitHub rejected pull request creation (${response.status}): ${detail} ${errors}`.trim(),
    );
    process.exit(1);
  }
  process.stdout.write(`${payload.html_url}\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  let program = 'git';
  let args = argv;
  if (argv[0] === 'pr') {
    program = 'pr';
    args = argv.slice(1);
  } else if (ALLOWED_PROGRAMS.includes(argv[0])) {
    program = argv[0];
    args = argv.slice(1);
  }

  const env = baseEnvironment();
  await applyManagedCredentials(env);

  if (program === 'pr') {
    if (args[0] !== 'create') {
      diagnostic('only "pr create" is supported.');
      process.exit(2);
    }
    await createPullRequest(args.slice(1), env);
    return;
  }
  runProgram(program, args, env);
}

main().catch((error) => {
  diagnostic(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
