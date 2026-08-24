import { createContext, useContext } from 'react';

/**
 * Makes the machine's mode available to the whole UI.
 *
 * The main process reads it from disk before the window is created and passes
 * it through the preload bridge, so it is already correct on the first render -
 * no loading state, no async round trip.
 */
const AppModeContext = createContext<string | null>(null);

export function AppModeProvider ({ children }: { children: React.ReactNode }) {
  return (
    <AppModeContext.Provider value={electron.appMode}>
      {children}
    </AppModeContext.Provider>
  );
}

/** The machine's mode, or `null` when it is not known. */
export function useAppMode (): string | null {
  return useContext(AppModeContext);
}
