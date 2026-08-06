import { vi } from 'vitest';

import type { globals } from '@/preload';

/**
 * Test double for the preload contextBridge API exposed as the `electron`
 * global. The `typeof globals` annotation makes this fail to compile if the
 * real preload API in src/preload.ts changes shape, keeping the stub honest.
 */
export function createElectronBridgeMock (): typeof globals {
  const ipcRenderer: (typeof globals)['ipcRenderer'] = {
    send: vi.fn(),
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(() => ipcRenderer),
    once: vi.fn(() => ipcRenderer),
    removeListener: vi.fn(() => ipcRenderer)
  };

  return {
    versions: {
      chrome: '138.0.0.0',
      node: '22.16.0',
      electron: '37.2.5'
    },
    getPathForFile: vi.fn((file: File) => `/mock/path/${file.name}`),
    ipcRenderer
  };
}

export function installElectronBridgeMock (): typeof globals {
  const bridge = createElectronBridgeMock();
  Object.assign(globalThis, { electron: bridge });
  return bridge;
}
