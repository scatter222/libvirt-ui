import { type IpcRendererEvent, contextBridge, ipcRenderer, webUtils } from 'electron';

const APP_MODE_ARG = '--app-mode=';

/**
 * The mode of the machine this app is deployed on, read from disk by the main
 * process and passed in as an extra argument. `null` when it is not known.
 */
function readAppMode (): string | null {
  const arg = process.argv.find((value) => value.startsWith(APP_MODE_ARG));

  return arg ? decodeURIComponent(arg.slice(APP_MODE_ARG.length)) || null : null;
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

  /** Mode of the machine this app is deployed on. */
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
