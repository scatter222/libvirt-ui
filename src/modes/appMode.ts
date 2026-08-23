import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type AppModeState,
  type FeatureFlags,
  type FeatureId,
  type ModeDefinition,
  type ModeSource,
  BUILT_IN_DEFAULT_MODE,
  BUILT_IN_MODES,
  NO_FEATURES,
  isFeatureId
} from '@/modes/features';

import { BrowserWindow, app, ipcMain } from 'electron';
import * as yaml from 'yaml';

export const MODE_CHANGED_CHANNEL = 'mode:changed';

/** Prefix of the extra renderer argument carrying the mode at startup. */
export const APP_MODE_ARG = '--app-mode=';

const MODE_ENV = 'LIBVIRT_UI_MODE';
const MODE_FILE_ENV = 'LIBVIRT_UI_MODE_FILE';
const MODE_CLI_SWITCH = '--mode=';

/** How often the mode file is polled for changes. */
const WATCH_INTERVAL_MS = 5000;

const CATALOG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/modes.yaml')
  : path.join(app.getAppPath(), 'config/modes.yaml');

interface ModeCatalog {
  defaultMode: string;
  modes: Record<string, ModeDefinition>;
  warning: string | null;
}

interface RawModeCatalog {
  defaultMode?: string;
  defaults?: Record<string, boolean>;
  modes?: Record<string, { label?: string; description?: string; features?: Record<string, boolean> }>;
}

let catalog: ModeCatalog | null = null;
let currentState: AppModeState | null = null;
let watchedPath: string | null = null;

/**
 * Candidate locations for the mode file, most specific first. The file holds a
 * single mode id; the meaning of that id lives in `config/modes.yaml`.
 */
function candidateModeFiles (): string[] {
  const candidates: string[] = [];

  const explicit = process.env[MODE_FILE_ENV];
  if (explicit) {
    candidates.push(explicit);
  }

  if (process.platform === 'win32') {
    candidates.push(path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'libvirt-ui', 'mode'));
  } else if (process.platform === 'darwin') {
    candidates.push('/Library/Application Support/libvirt-ui/mode');
  } else {
    candidates.push('/etc/libvirt-ui/mode');
  }

  // Per-user override, handy for testing on a machine you cannot write /etc on.
  candidates.push(path.join(app.getPath('userData'), 'mode'));

  return candidates;
}

/**
 * Accepts either a bare id (`standalone`) or a small YAML document
 * (`mode: standalone`). Comments and blank lines are ignored.
 */
function parseModeFile (contents: string): string | null {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  const first = lines[0];
  const keyed = (/^mode\s*:\s*(.+)$/i).exec(first);
  const value = keyed ? keyed[1] : first;

  return value.replace(/^['"]|['"]$/g, '').trim() || null;
}

function readModeFile (): { mode: string; filePath: string } | null {
  for (const filePath of candidateModeFiles()) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const mode = parseModeFile(fs.readFileSync(filePath, 'utf8'));
      if (mode) return { mode, filePath };
    } catch (error) {
      console.error(`Failed to read mode file ${filePath}:`, error);
    }
  }

  return null;
}

function readModeSwitch (): string | null {
  const arg = process.argv.find((value) => value.startsWith(MODE_CLI_SWITCH));
  return arg ? arg.slice(MODE_CLI_SWITCH.length).trim() || null : null;
}

function coerceFlags (
  base: Record<string, boolean>,
  overrides: Record<string, boolean> | undefined,
  modeId: string
): FeatureFlags {
  const flags: FeatureFlags = { ...NO_FEATURES };

  for (const [key, value] of Object.entries({ ...base, ...(overrides ?? {}) })) {
    if (!isFeatureId(key)) {
      console.warn(`Unknown feature "${key}" in mode "${modeId}" - ignored.`);
      continue;
    }
    flags[key] = Boolean(value);
  }

  return flags;
}

function loadCatalog (): ModeCatalog {
  if (catalog) return catalog;

  const builtIn: ModeCatalog = {
    defaultMode: BUILT_IN_DEFAULT_MODE,
    modes: BUILT_IN_MODES,
    warning: null
  };

  let raw: RawModeCatalog;
  try {
    raw = yaml.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) as RawModeCatalog;
  } catch (error) {
    console.error('Failed to load mode catalog, falling back to built-in modes:', error);
    catalog = { ...builtIn, warning: `Mode catalog ${CATALOG_PATH} could not be read; using built-in modes.` };
    return catalog;
  }

  const entries = Object.entries(raw?.modes ?? {});
  if (entries.length === 0) {
    catalog = { ...builtIn, warning: `Mode catalog ${CATALOG_PATH} defines no modes; using built-in modes.` };
    return catalog;
  }

  const modes: Record<string, ModeDefinition> = {};
  for (const [id, definition] of entries) {
    modes[id] = {
      id,
      label: definition?.label ?? id,
      description: definition?.description ?? '',
      features: coerceFlags(raw.defaults ?? {}, definition?.features, id)
    };
  }

  catalog = {
    defaultMode: raw.defaultMode && modes[raw.defaultMode] ? raw.defaultMode : Object.keys(modes)[0],
    modes,
    warning: null
  };

  return catalog;
}

function resolveState (): AppModeState {
  const loaded = loadCatalog();

  const fromFile = readModeFile();
  const requested: { id: string | null; source: ModeSource; filePath: string | null } =
    process.env[MODE_ENV]
      ? { id: process.env[MODE_ENV] as string, source: 'env', filePath: null }
      : readModeSwitch()
        ? { id: readModeSwitch(), source: 'cli', filePath: null }
        : fromFile
          ? { id: fromFile.mode, source: 'file', filePath: fromFile.filePath }
          : { id: null, source: 'default', filePath: null };

  const warnings: string[] = [];
  if (loaded.warning) warnings.push(loaded.warning);

  let id = requested.id ?? loaded.defaultMode;
  let source = requested.source;

  if (!loaded.modes[id]) {
    warnings.push(`Unknown mode "${id}"${requested.filePath ? ` in ${requested.filePath}` : ''}; using "${loaded.defaultMode}".`);
    id = loaded.defaultMode;
    source = 'fallback';
  }

  const definition = loaded.modes[id];

  return {
    mode: definition.id,
    label: definition.label,
    description: definition.description,
    features: definition.features,
    source,
    sourcePath: source === 'file' ? requested.filePath : null,
    availableModes: Object.values(loaded.modes).map(({ id: modeId, label, description }) => ({
      id: modeId,
      label,
      description
    })),
    warning: warnings.length ? warnings.join(' ') : null
  };
}

/** Resolved state for the current run. Safe to call from anywhere in main. */
export function getAppModeState (): AppModeState {
  if (!currentState) {
    currentState = resolveState();
    console.info(`App mode: ${currentState.mode} (source: ${currentState.source})`);
    if (currentState.warning) console.warn(currentState.warning);
  }

  return currentState;
}

export function isFeatureEnabled (feature: FeatureId): boolean {
  return getAppModeState().features[feature];
}

/**
 * Devtools always work in a development build; in a packaged deployment the
 * machine's mode decides, so a locked-down build cannot be poked at.
 */
export function isDevToolsAllowed (): boolean {
  return !app.isPackaged || isFeatureEnabled('devTools');
}

/**
 * Re-read the mode file (and, if `reloadCatalog`, `config/modes.yaml`).
 * Returns whether the effective mode changed.
 */
export function reloadAppMode (reloadCatalog = false): { changed: boolean; state: AppModeState } {
  if (reloadCatalog) catalog = null;

  const previous = getAppModeState();
  const next = resolveState();
  currentState = next;

  const changed = previous.mode !== next.mode ||
    JSON.stringify(previous.features) !== JSON.stringify(next.features);

  if (changed) {
    console.info(`App mode changed: ${previous.mode} -> ${next.mode} (source: ${next.source})`);
  }

  return { changed, state: next };
}

function broadcastModeChange (state: AppModeState): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(MODE_CHANGED_CHANNEL, state);
  }
}

/**
 * Poll the mode file so flipping the machine's state takes effect without a
 * restart. `fs.watchFile` (polling) is used deliberately: the file is usually
 * replaced atomically by configuration management, which `fs.watch` misses.
 */
export function watchAppModeFile (): void {
  const state = getAppModeState();
  const target = state.sourcePath ?? candidateModeFiles()[0];

  if (!target || watchedPath === target) return;

  if (watchedPath) fs.unwatchFile(watchedPath);
  watchedPath = target;

  fs.watchFile(target, { interval: WATCH_INTERVAL_MS }, () => {
    const { changed, state: next } = reloadAppMode();
    if (changed) broadcastModeChange(next);
  });

  app.on('will-quit', () => {
    if (watchedPath) {
      fs.unwatchFile(watchedPath);
      watchedPath = null;
    }
  });
}

type IpcInvokeHandler = Parameters<typeof ipcMain.handle>[1];

/**
 * Registers an IPC handler that only runs while `feature` is enabled.
 *
 * The UI already hides disabled areas; this makes the main process the actual
 * boundary, so a stale renderer, a deep link or devtools cannot reach a feature
 * the machine's mode has turned off.
 */
export function handleFeatureIpc (feature: FeatureId, channel: string, listener: IpcInvokeHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isFeatureEnabled(feature)) {
      throw new Error(`Feature "${feature}" is disabled in "${getAppModeState().mode}" mode.`);
    }

    return listener(event, ...args);
  });
}
