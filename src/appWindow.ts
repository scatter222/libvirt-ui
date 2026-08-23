import path from 'node:path';

import { MenuChannels } from '@/channels/menuChannels';
import { registerMenuIpc } from '@/ipc/menuIPC';
import appMenu from '@/menu/appMenu';
import { APP_MODE_ARG, getAppModeState, isDevToolsAllowed } from '@/modes/appMode';
import { registerWindowStateChangedEvents } from '@/windowState';

import { BrowserWindow, Menu, app } from 'electron';
import windowStateKeeper from 'electron-window-state';

let appWindow: BrowserWindow;

/**
 * Create Application Window
 * @returns { BrowserWindow } Application Window Instance
 */
export function createAppWindow (): BrowserWindow {
  const minWidth = 960;
  const minHeight = 660;

  const savedWindowState = windowStateKeeper({
    defaultWidth: minWidth,
    defaultHeight: minHeight,
    maximize: false
  });

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    x: savedWindowState.x,
    y: savedWindowState.y,
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth,
    minHeight,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      preload: path.join(import.meta.dirname, 'preload.js'),
      // Ship the deployment mode into the preload script so the UI knows which
      // features are on before it renders its first frame.
      additionalArguments: [`${APP_MODE_ARG}${encodeURIComponent(JSON.stringify(getAppModeState()))}`]
    }
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hidden';
  }

  // Create new window instance
  appWindow = new BrowserWindow(windowOptions);

  // Load the index.html of the app window.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    appWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    appWindow.loadFile(path.join(import.meta.dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Build the application menu
  const menu = Menu.buildFromTemplate(appMenu);

  // The devtools item uses a native role, so the mode has to be applied to the
  // menu item itself - a disabled item also disables its accelerator.
  const devTools = menu.getMenuItemById(MenuChannels.WEB_TOGGLE_DEVTOOLS);
  if (devTools) {
    devTools.visible = isDevToolsAllowed();
    devTools.enabled = isDevToolsAllowed();
  }

  Menu.setApplicationMenu(menu);

  // Show window when is ready to
  appWindow.on('ready-to-show', () => {
    appWindow.show();
  });

  // Register Inter Process Communication for main process
  registerMainIPC();

  savedWindowState.manage(appWindow);

  // Close all windows when main window is closed
  appWindow.on('close', () => {
    appWindow = null;
    app.quit();
  });

  return appWindow;
}

/**
 * Register Inter Process Communication
 */
function registerMainIPC () {
  /**
   * Here you can assign IPC related codes for the application window
   * to Communicate asynchronously from the main process to renderer processes.
   */
  registerWindowStateChangedEvents(appWindow);
  registerMenuIpc(appWindow);
}
