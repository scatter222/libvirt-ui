/**
 * Deployment modes.
 *
 * The machine this app is deployed on can be in one of several states
 * (standalone, connected to the lab, in training, under maintenance...). That
 * state is read from a plain text file on disk by the main process at startup
 * (see `src/modes/appMode.ts`) and turns individual features - tabs, screens
 * and IPC channels - on or off.
 *
 * This module is the shared contract between the main process, the preload
 * script and the renderer, so it must stay free of any `electron` or `node`
 * imports.
 */

/** Every switchable feature in the app. Add new ones here first. */
export const FEATURES = [
  'dashboard',
  'tools',
  'vms',
  'remoteVms',
  'webApps',
  'rules',
  'api',
  'devTools'
] as const;

export type FeatureId = typeof FEATURES[number];

export type FeatureFlags = Record<FeatureId, boolean>;

/** Where the active mode was resolved from, useful for troubleshooting. */
export type ModeSource = 'env' | 'cli' | 'file' | 'default' | 'fallback';

export interface ModeDefinition {
  id: string;
  label: string;
  description: string;
  features: FeatureFlags;
}

export interface AppModeState {
  /** Id of the active mode, e.g. `standalone`. */
  mode: string;
  label: string;
  description: string;
  /** Fully resolved flags - every feature is present, no `undefined`. */
  features: FeatureFlags;
  /** How the mode was chosen. */
  source: ModeSource;
  /** Absolute path of the mode file when `source` is `file`. */
  sourcePath: string | null;
  /** All modes defined in the catalog, for pickers and diagnostics. */
  availableModes: Array<{ id: string; label: string; description: string }>;
  /** Set when the mode file named something unknown or the catalog failed to load. */
  warning: string | null;
}

/** Nothing is on until a mode says so, so a broken config fails closed. */
export const NO_FEATURES: FeatureFlags = FEATURES.reduce((acc, feature) => {
  acc[feature] = false;
  return acc;
}, {} as FeatureFlags);

export const ALL_FEATURES: FeatureFlags = FEATURES.reduce((acc, feature) => {
  acc[feature] = true;
  return acc;
}, {} as FeatureFlags);

/**
 * Catalog used when `config/modes.yaml` is missing or unreadable, so a broken
 * deployment still gets a working app instead of a blank window. Keep it in
 * sync with `config/modes.yaml`.
 */
export const BUILT_IN_MODES: Record<string, ModeDefinition> = {
  full: {
    id: 'full',
    label: 'Full Lab',
    description: 'Connected to the lab: every tab and feature is available.',
    features: { ...ALL_FEATURES, devTools: false }
  },
  standalone: {
    id: 'standalone',
    label: 'Standalone',
    description: 'No connectivity to the lab API. Local VMs and tools only.',
    features: {
      ...ALL_FEATURES,
      remoteVms: false,
      webApps: false,
      rules: false,
      api: false,
      devTools: false
    }
  },
  training: {
    id: 'training',
    label: 'Training',
    description: 'Classroom build: tools and web apps, no VM lifecycle control.',
    features: {
      ...NO_FEATURES,
      dashboard: true,
      tools: true,
      webApps: true,
      api: true
    }
  },
  maintenance: {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Machine is being serviced. Everything but the dashboard is off.',
    features: { ...NO_FEATURES, dashboard: true }
  }
};

export const BUILT_IN_DEFAULT_MODE = 'full';

/** Used by the renderer if the main process bootstrap is ever unavailable. */
export const FALLBACK_APP_MODE_STATE: AppModeState = {
  mode: BUILT_IN_DEFAULT_MODE,
  label: BUILT_IN_MODES[BUILT_IN_DEFAULT_MODE].label,
  description: BUILT_IN_MODES[BUILT_IN_DEFAULT_MODE].description,
  features: BUILT_IN_MODES[BUILT_IN_DEFAULT_MODE].features,
  source: 'fallback',
  sourcePath: null,
  availableModes: Object.values(BUILT_IN_MODES).map(({ id, label, description }) => ({ id, label, description })),
  warning: null
};

export function isFeatureId (value: string): value is FeatureId {
  return (FEATURES as readonly string[]).includes(value);
}
