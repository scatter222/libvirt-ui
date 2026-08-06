import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type ElectronApplication, type Page, test as base, _electron } from '@playwright/test';

const rootDir = path.resolve(import.meta.dirname, '../..');
const builtMain = path.join(rootDir, '.vite/build/main.js');

interface ElectronFixtures {
  electronApp: ElectronApplication;
  window: Page;
}

/**
 * Launches the real built app (package.json "main" -> .vite/build/main.js).
 * Each test gets its own instance with a throwaway user-data-dir so window
 * state, localStorage and caches never leak between runs.
 */
export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => { // eslint-disable-line no-empty-pattern
    if (!fs.existsSync(builtMain)) {
      throw new Error(`Missing build output at ${builtMain} — run "pnpm exec electron-forge package" first (or use "pnpm test:e2e", which builds).`);
    }

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libvirt-ui-e2e-'));
    const app = await _electron.launch({
      args: [
        '.',
        `--user-data-dir=${userDataDir}`,
        // Required on CI containers without a setuid sandbox helper.
        '--no-sandbox'
      ],
      cwd: rootDir
    });

    try {
      await use(app);
    } finally {
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  window: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await use(window);
  }
});

export { expect } from '@playwright/test';
