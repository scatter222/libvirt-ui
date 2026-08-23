import { vi } from 'vitest';

/**
 * Minimal mock of the `electron` module for main-process unit tests, aliased
 * in place of `electron` by the `main` Vitest project (the real module can
 * only be imported inside an Electron runtime). It implements only the APIs
 * the main-process code under test actually touches — extend it as more main
 * code gains tests.
 */

type IpcListener = (event: unknown, ...args: unknown[]) => unknown;

function createIpcMainMock () {
  const listeners = new Map<string, IpcListener>();
  const handlers = new Map<string, IpcListener>();

  return {
    on: vi.fn((channel: string, listener: IpcListener) => {
      listeners.set(channel, listener);
    }),
    handle: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),

    /** Test helper: deliver an event as if the renderer called ipcRenderer.send. */
    emit (channel: string, event: unknown, ...args: unknown[]) {
      const listener = listeners.get(channel);
      if (!listener) {
        throw new Error(`No ipcMain.on listener registered for '${channel}'`);
      }
      return listener(event, ...args);
    },

    /** Test helper: invoke a handler as if the renderer called ipcRenderer.invoke. */
    invoke (channel: string, event: unknown = {}, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`No ipcMain.handle handler registered for '${channel}'`);
      }
      return handler(event, ...args);
    },

    /** Test helper: reset all registered channels between tests. */
    reset () {
      listeners.clear();
      handlers.clear();
    }
  };
}

export const ipcMain = createIpcMainMock();

// app.getAppPath() decides where modules look for their config/ directory.
// Tests point it at a temp fixture directory BEFORE importing the module
// under test (config paths are computed at import time).
let appPath = process.cwd();

export const app = {
  isPackaged: false,
  getAppPath: vi.fn(() => appPath),
  setAppPath (p: string) {
    appPath = p;
  }
};

let applicationMenu: unknown = null;

export const Menu = {
  buildFromTemplate: vi.fn((template: unknown) => ({
    template,
    popup: vi.fn(),
    getMenuItemById: vi.fn(() => null)
  })),
  setApplicationMenu: vi.fn((menu: unknown) => {
    applicationMenu = menu;
  }),
  getApplicationMenu: vi.fn(() => applicationMenu)
};

export const BrowserWindow = {
  getAllWindows: vi.fn(() => [] as unknown[]),
  fromWebContents: vi.fn(() => null)
};

export const shell = {
  openExternal: vi.fn(() => Promise.resolve()),
  // Electron resolves with '' on success, or an error message string
  openPath: vi.fn(() => Promise.resolve(''))
};

// net.request is stubbed per test (see tests/setup/net-stub.ts)
export const net = {
  request: vi.fn()
};

export function resetElectronMock () {
  ipcMain.reset();
  applicationMenu = null;
  appPath = process.cwd();
  vi.mocked(app.getAppPath).mockClear();
  vi.mocked(Menu.buildFromTemplate).mockClear();
  vi.mocked(Menu.setApplicationMenu).mockClear();
  vi.mocked(Menu.getApplicationMenu).mockClear();
  vi.mocked(BrowserWindow.getAllWindows).mockClear();
  vi.mocked(BrowserWindow.fromWebContents).mockClear();
  vi.mocked(shell.openExternal).mockClear();
  vi.mocked(shell.openPath).mockClear();
  vi.mocked(net.request).mockReset();
}
