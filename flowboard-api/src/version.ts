import { readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * The `flowboard-api` package version, reported by `GET /v1/health`.
 * Resolved by walking up from this module so it works both from `src/`
 * under tsx and from the compiled `dist/` layout.
 */
function resolvePackageVersion(startDir: string): string {
  const { root } = parse(startDir);
  let current = startDir;

  for (;;) {
    try {
      const raw = readFileSync(join(current, 'package.json'), 'utf8');
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      if (parsed.name === '@flowboard/api' && typeof parsed.version === 'string') {
        return parsed.version;
      }
    } catch {
      // No package.json at this level, or it is not ours: keep walking up.
    }

    if (current === root) {
      throw new Error('Unable to resolve the @flowboard/api package version');
    }
    current = dirname(current);
  }
}

export const API_PACKAGE_VERSION = resolvePackageVersion(import.meta.dirname);
