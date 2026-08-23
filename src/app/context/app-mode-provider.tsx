import {
  type AppModeState,
  type FeatureId,
  FALLBACK_APP_MODE_STATE
} from '@/modes/features';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const MODE_CHANGED_CHANNEL = 'mode:changed';

interface AppModeContextValue extends AppModeState {
  /** True when the machine's current mode enables `feature`. */
  isEnabled: (feature: FeatureId) => boolean;
  /** Re-read the mode file and catalog from disk. */
  reload: () => Promise<void>;
}

const AppModeContext = createContext<AppModeContextValue | null>(null);

/**
 * Makes the machine's deployment mode available to the whole UI.
 *
 * The initial value comes from the preload bootstrap, so it is correct on the
 * first render - there is no loading state and no flash of features the mode
 * has turned off. If the mode file changes while the app runs, the main
 * process pushes the new state over `mode:changed` and the UI follows.
 */
export function AppModeProvider ({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppModeState>(() => electron.appMode ?? FALLBACK_APP_MODE_STATE);

  useEffect(() => {
    const onModeChanged = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
      setState(args[0] as AppModeState);
    };

    electron.ipcRenderer.on(MODE_CHANGED_CHANNEL, onModeChanged);
    return () => {
      electron.ipcRenderer.removeListener(MODE_CHANGED_CHANNEL, onModeChanged);
    };
  }, []);

  const isEnabled = useCallback((feature: FeatureId) => state.features[feature], [state.features]);

  const reload = useCallback(async () => {
    const result = await electron.ipcRenderer.invoke('mode:reload') as { state: AppModeState };
    if (result?.state) setState(result.state);
  }, []);

  // Memoised so consumers can safely depend on `isEnabled` in effect deps.
  const value = useMemo<AppModeContextValue>(
    () => ({ ...state, isEnabled, reload }),
    [
      state,
      isEnabled,
      reload
    ]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}

export function useAppMode (): AppModeContextValue {
  const context = useContext(AppModeContext);

  if (!context) throw new Error('useAppMode must be used within an AppModeProvider');

  return context;
}

/** Convenience hook for a single flag: `const canSeeVms = useFeature('vms')`. */
export function useFeature (feature: FeatureId): boolean {
  return useAppMode().isEnabled(feature);
}

/** Renders `children` only when the feature is enabled in the current mode. */
export function Feature ({
  name,
  fallback = null,
  children
}: {
  name: FeatureId;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  return useFeature(name) ? <>{children}</> : <>{fallback}</>;
}
