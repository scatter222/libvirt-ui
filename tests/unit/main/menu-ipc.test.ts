import { beforeEach, describe, expect, it, vi } from 'vitest';

// The `main` project aliases 'electron' to this same module, so the code
// under test and the test share one mock instance.
import { ipcMain, resetElectronMock, shell } from '../../mocks/electron';

import { MenuChannels } from '@/channels/menuChannels';
import { registerMenuIpc } from '@/ipc/menuIPC';

function createFakeMainWindow () {
  const state = {
    minimized: false,
    maximized: false,
    fullScreen: false,
    closed: false,
    zoomLevel: 0,
    devToolsOpen: false
  };

  const fakeWindow = {
    minimize: () => { state.minimized = true; },
    maximize: () => { state.maximized = true; },
    unmaximize: () => { state.maximized = false; },
    isMaximized: () => state.maximized,
    close: () => { state.closed = true; },
    setFullScreen: (flag: boolean) => { state.fullScreen = flag; },
    get fullScreen () { return state.fullScreen; },
    webContents: {
      toggleDevTools: () => { state.devToolsOpen = !state.devToolsOpen; },
      setZoomLevel: (level: number) => { state.zoomLevel = level; },
      get zoomLevel () { return state.zoomLevel; }
    }
  };

  return { state, fakeWindow: fakeWindow as unknown as Electron.BrowserWindow };
}

describe('registerMenuIpc', () => {
  beforeEach(() => {
    resetElectronMock();
  });

  it('toggles between maximized and unmaximized across repeated invocations', async () => {
    const { state, fakeWindow } = createFakeMainWindow();
    registerMenuIpc(fakeWindow);

    await ipcMain.invoke(MenuChannels.WINDOW_TOGGLE_MAXIMIZE);
    expect(state.maximized).toBe(true);

    await ipcMain.invoke(MenuChannels.WINDOW_TOGGLE_MAXIMIZE);
    expect(state.maximized).toBe(false);
  });

  it('minimizes and closes the window on the matching channels', async () => {
    const { state, fakeWindow } = createFakeMainWindow();
    registerMenuIpc(fakeWindow);

    await ipcMain.invoke(MenuChannels.WINDOW_MINIMIZE);
    expect(state.minimized).toBe(true);

    await ipcMain.invoke(MenuChannels.WINDOW_CLOSE);
    expect(state.closed).toBe(true);
  });

  it('steps the zoom level by half a unit and resets it to zero on actual size', async () => {
    const { state, fakeWindow } = createFakeMainWindow();
    registerMenuIpc(fakeWindow);

    await ipcMain.invoke(MenuChannels.WEB_ZOOM_IN);
    await ipcMain.invoke(MenuChannels.WEB_ZOOM_IN);
    expect(state.zoomLevel).toBe(1);

    await ipcMain.invoke(MenuChannels.WEB_ZOOM_OUT);
    expect(state.zoomLevel).toBe(0.5);

    await ipcMain.invoke(MenuChannels.WEB_ACTUAL_SIZE);
    expect(state.zoomLevel).toBe(0);
  });

  it('toggles full screen based on the current window state', async () => {
    const { state, fakeWindow } = createFakeMainWindow();
    registerMenuIpc(fakeWindow);

    await ipcMain.invoke(MenuChannels.WEB_TOGGLE_FULLSCREEN);
    expect(state.fullScreen).toBe(true);

    await ipcMain.invoke(MenuChannels.WEB_TOGGLE_FULLSCREEN);
    expect(state.fullScreen).toBe(false);
  });

  it('opens the GitHub profile URL built from the requested id', async () => {
    const { fakeWindow } = createFakeMainWindow();
    registerMenuIpc(fakeWindow);

    await ipcMain.invoke(MenuChannels.OPEN_GITHUB_PROFILE, {}, 'flaviodelgrosso');

    expect(vi.mocked(shell.openExternal)).toHaveBeenCalledExactlyOnceWith('https://github.com/flaviodelgrosso');
  });
});
