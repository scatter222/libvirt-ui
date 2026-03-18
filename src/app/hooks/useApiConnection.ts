import { useCallback, useEffect, useState } from 'react';

interface ApiHealth {
  connected: boolean;
  status: number;
  data: {
    status: string;
    timestamp: string;
    version: string;
  } | null;
}

interface ApiUser {
  name: string;
  authenticationType: string;
  isAuthenticated: boolean;
}

interface ApiConnectionState {
  connected: boolean;
  user: ApiUser | null;
  loading: boolean;
  error: string | null;
}

export function useApiConnection (pollIntervalMs: number = 30000) {
  const [state, setState] = useState<ApiConnectionState>({
    connected: false,
    user: null,
    loading: true,
    error: null
  });

  const checkConnection = useCallback(async () => {
    try {
      // Check health (unauthenticated)
      const health = await electron.ipcRenderer.invoke('api:health') as ApiHealth;

      if (!health.connected) {
        setState({ connected: false, user: null, loading: false, error: 'API server unreachable' });
        return;
      }

      // Try to get user info (authenticated)
      const userResult = await electron.ipcRenderer.invoke('api:user') as {
        success: boolean;
        data?: { name: string; authenticationType: string; isAuthenticated: boolean };
        error?: string;
      };

      if (userResult.success && userResult.data) {
        setState({
          connected: true,
          user: {
            name: userResult.data.name,
            authenticationType: userResult.data.authenticationType,
            isAuthenticated: userResult.data.isAuthenticated
          },
          loading: false,
          error: null
        });
      } else {
        setState({
          connected: true,
          user: null,
          loading: false,
          error: userResult.error || 'Authentication failed'
        });
      }
    } catch {
      setState({ connected: false, user: null, loading: false, error: 'Connection check failed' });
    }
  }, []);

  useEffect(() => {
    checkConnection();
    const interval = setInterval(checkConnection, pollIntervalMs);
    return () => clearInterval(interval);
  }, [checkConnection, pollIntervalMs]);

  return { ...state, refresh: checkConnection };
}
