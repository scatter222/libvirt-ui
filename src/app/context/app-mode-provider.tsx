import { createContext, useContext } from 'react';

/**
 * Makes the machine's mode available to the whole UI.
 *
 * The main process reads it from disk before the window is created and passes
 * it through the preload bridge, so it is already correct on the first render -
 * no loading state, no async round trip.
 *
 * The default is `undefined` rather than `null` so that "no provider above this
 * component" stays distinguishable from "the machine has no mode".
 */
const AppModeContext = createContext<string | null | undefined>(undefined);

export function AppModeProvider ({ children }: { children: React.ReactNode }) {
  return (
    <AppModeContext.Provider value={electron.appMode}>
      {children}
    </AppModeContext.Provider>
  );
}

/** The machine's mode, or `null` when it is not known. */
export function useAppMode (): string | null {
  const mode = useContext(AppModeContext);

  if (mode === undefined) {
    // Nothing provided a value: either this component renders outside
    // <AppModeProvider>, or a hot update left two copies of this module (and
    // therefore two different contexts) in play - reload the window to check.
    if (__DEV__) {
      console.warn('useAppMode(): no <AppModeProvider> above this component, reading the preload value directly.');
    }

    return electron.appMode;
  }

  return mode;
}
