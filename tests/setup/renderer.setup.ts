import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

import { installElectronBridgeMock } from './electron-bridge-mock';

// A fresh bridge stub per test so mock state never leaks between tests.
beforeEach(() => {
  installElectronBridgeMock();
});

afterEach(() => {
  cleanup();
});
