import { type AppModeState, FALLBACK_APP_MODE_STATE } from '@/modes/features';

import { type IpcRendererEvent, contextBridge, ipcRenderer, webUtils } from 'electron';

const APP_MODE_ARG = '--app-mode=';

/**
 * The main process resolves the machine's deployment mode before the window is
 * created and passes it in as an extra argument, so the UI can decide which
 * tabs and features exist without an async round trip (and without a flash of
 * features that mode has turned off). `mode:get` re-fetches it on demand.
 */
function readAppMode (): AppModeState {
  const arg = process.argv.find((value) => value.startsWith(APP_MODE_ARG));

  if (arg) {
    try {
      return JSON.parse(decodeURIComponent(arg.slice(APP_MODE_ARG.length))) as AppModeState;
    } catch (error) {
      console.error('Failed to parse app mode bootstrap:', error);
    }
  }

  return FALLBACK_APP_MODE_STATE;
}

const versions: Record<string, unknown> = {};

// Process versions
for (const type of [
  'chrome',
  'node',
  'electron'
]) {
  versions[type] = process.versions[type];
}

function validateIPC (channel: string) {
  if (!channel) {
    throw new Error(`Unsupported event IPC channel '${channel}'`);
  }

  return true;
}

export type RendererListener = (event: IpcRendererEvent, ...args: unknown[]) => void;

export const globals = {
  /** Processes versions **/
  versions,

  /** Deployment mode and feature flags resolved by the main process. */
  appMode: readAppMode(),

  /**
   * Resolve the real filesystem path of a File object (e.g. one dropped onto
   * the window from the desktop), for main-process file operations.
   */
  getPathForFile (file: File): string {
    return webUtils.getPathForFile(file);
  },

  /**
   * A minimal set of methods exposed from Electron's `ipcRenderer`
   * to support communication to main process.
   */
  ipcRenderer: {
    send (channel: string, ...args: unknown[]) {
      if (validateIPC(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },

    invoke (channel: string, ...args: unknown[]) {
      if (validateIPC(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
    },

    on (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.on(channel, listener);

        return this;
      }
    },

    once (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.once(channel, listener);

        return this;
      }
    },

    removeListener (channel: string, listener: RendererListener) {
      if (validateIPC(channel)) {
        ipcRenderer.removeListener(channel, listener);

        return this;
      }
    }
  }
};

// Create a safe, bidirectional, synchronous bridge across isolated contexts
// When contextIsolation is enabled in your webPreferences, your preload scripts run in an "Isolated World".
contextBridge.exposeInMainWorld('electron', globals);
