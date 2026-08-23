import { getAppModeState, reloadAppMode, watchAppModeFile } from '@/modes/appMode';

import { ipcMain } from 'electron';

/**
 * Exposes the deployment mode to the renderer.
 *
 * The renderer normally gets the mode synchronously at startup (see the
 * `--app-mode=` argument set in `appWindow.ts`); these channels cover refresh,
 * manual reload and diagnostics.
 */
export function setupModeIPC (): void {
  ipcMain.handle('mode:get', () => getAppModeState());

  // Force a re-read of the mode file and the mode catalog.
  ipcMain.handle('mode:reload', () => {
    const { changed, state } = reloadAppMode(true);
    return { changed, state };
  });

  watchAppModeFile();
}
