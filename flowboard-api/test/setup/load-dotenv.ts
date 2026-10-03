import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Minimal `.env` loader for local integration runs. CI sets the variables
 * directly, so this is a convenience only and never overwrites an existing
 * value. Keeping it here avoids adding a dependency that FB-00 §9 does not list.
 */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envFile)) {
  for (const rawLine of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
