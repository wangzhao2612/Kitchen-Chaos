import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const name of ['artifacts', 'playwright-report', 'test-results']) {
  rmSync(join(root, name), { recursive: true, force: true });
}
console.log('Test outputs removed; source fixtures and game resources retained.');
