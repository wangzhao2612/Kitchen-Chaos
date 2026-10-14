import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

// Prefer the latest real run, with historical sanitized records for isolated tests.
export function recordedTestFile(name) {
  const latest = join(root, 'artifacts', name);
  return existsSync(latest) ? latest : join(root, 'tests', 'fixtures', name);
}
