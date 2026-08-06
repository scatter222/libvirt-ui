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
  openExternal: vi.fn(() => Promise.resolve())
};

export function resetElectronMock () {
  ipcMain.reset();
  applicationMenu = null;
  vi.mocked(Menu.buildFromTemplate).mockClear();
  vi.mocked(Menu.setApplicationMenu).mockClear();
  vi.mocked(Menu.getApplicationMenu).mockClear();
  vi.mocked(BrowserWindow.getAllWindows).mockClear();
  vi.mocked(BrowserWindow.fromWebContents).mockClear();
  vi.mocked(shell.openExternal).mockClear();
}
