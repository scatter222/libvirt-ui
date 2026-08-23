import { vi } from 'vitest';

import type { RendererListener, globals } from '@/preload';

/**
 * Test double for the preload contextBridge API exposed as the `electron`
 * global. The `typeof globals` annotation makes this fail to compile if the
 * real preload API in src/preload.ts changes shape, keeping the stub honest.
 *
 * ipcRenderer.on/removeListener maintain a real listener registry, so tests
 * can simulate main→renderer events (e.g. deploy progress) with
 * emitRendererEvent().
 */

type Bridge = typeof globals;

let listeners = new Map<string, Set<RendererListener>>();

export function createElectronBridgeMock (): Bridge {
  listeners = new Map();

  const addListener = (channel: string, listener: RendererListener) => {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
  };

  const ipcRenderer: Bridge['ipcRenderer'] = {
    send: vi.fn(),
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn((channel: string, listener: RendererListener) => {
      addListener(channel, listener);
      return ipcRenderer;
    }),
    once: vi.fn((channel: string, listener: RendererListener) => {
      const wrapped: RendererListener = (event, ...args) => {
        listeners.get(channel)?.delete(wrapped);
        listener(event, ...args);
      };
      addListener(channel, wrapped);
      return ipcRenderer;
    }),
    removeListener: vi.fn((channel: string, listener: RendererListener) => {
      listeners.get(channel)?.delete(listener);
      return ipcRenderer;
    })
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

/** Deliver an event to renderer-side listeners, as main-process code would. */
export function emitRendererEvent (channel: string, ...args: unknown[]): void {
  const event = { senderId: 0 } as unknown as Parameters<RendererListener>[0];
  for (const listener of [...(listeners.get(channel) ?? [])]) {
    listener(event, ...args);
  }
}

export function installElectronBridgeMock (): Bridge {
  const bridge = createElectronBridgeMock();
  Object.assign(globalThis, { electron: bridge });
  return bridge;
}
