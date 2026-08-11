#!/usr/bin/env node
/**
 * Interactive recorder for E2E tests.
 *
 * `playwright codegen` cannot attach to Electron on any platform, so this
 * script launches the real built app exactly like tests/e2e/electron-app.ts
 * does, with PWDEBUG=1 so Playwright opens its Inspector window (which
 * requires Playwright's Chromium: `pnpm exec playwright install chromium` —
 * the dev container does this for you). Hit Record in the Inspector, click
 * around the app, then copy the generated actions into a spec that uses the
 * `test` fixture from tests/e2e/electron-app.ts. The recorder names the page
 * `page`; in our fixture it is `window`.
 *
 * Usage:  pnpm test:record   (builds first if .vite/ is missing; needs a display)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { _electron } from '@playwright/test';

// Debug mode is what makes Playwright open the Inspector for library-mode
// (non-test-runner) launches like this one.
process.env.PWDEBUG = process.env.PWDEBUG || '1';

const rootDir = path.resolve(import.meta.dirname, '../..');
const builtMain = path.join(rootDir, '.vite/build/main.js');

if (!fs.existsSync(builtMain)) {
  console.log('No build output found — running electron-forge package first...');
  execFileSync('pnpm', ['exec', 'electron-forge', 'package'], { cwd: rootDir, stdio: 'inherit' });
}
console.log('Tip: the recorder drives the LAST build. After changing src/, rebuild with: pnpm exec electron-forge package');

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'libvirt-ui-record-'));
const app = await _electron.launch({
  args: [
    '.',
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox'
  ],
  cwd: rootDir
});

const window = await app.firstWindow();

// Keeps the session open while you record in the Inspector.
// Press Resume (F8) there when you are done; the app then closes.
await window.pause();

await app.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
