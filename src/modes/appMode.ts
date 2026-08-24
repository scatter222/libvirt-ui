import * as fs from 'node:fs';

/**
 * The machine this app is deployed on can be in one of several states. That
 * state is written to a file on disk by whatever provisions the machine, and
 * the app reads it once at startup.
 */
const MODE_FILE = '/usr/share/mode';

/** Prefix of the extra renderer argument that carries the mode to the preload script. */
export const APP_MODE_ARG = '--app-mode=';

let mode: string | null | undefined;

/**
 * The machine's mode, or `null` if the file is missing or empty.
 *
 * Read once and cached: the mode describes how the machine was provisioned, so
 * it does not change under a running app.
 */
export function getAppMode (): string | null {
  if (mode !== undefined) return mode;

  try {
    mode = fs.readFileSync(MODE_FILE, 'utf8').trim() || null;
  } catch (error) {
    console.error(`Failed to read ${MODE_FILE}:`, error instanceof Error ? error.message : error);
    mode = null;
  }

  console.info(`App mode: ${mode ?? 'unknown'}`);

  return mode;
}
