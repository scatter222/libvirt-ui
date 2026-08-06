import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionStatus } from '@/app/components/connection-status';

type Handler = (channel: string, ...args: unknown[]) => Promise<unknown>;

function stubApi (handlers: Record<string, unknown | Error>) {
  const invoke: Handler = async (channel) => {
    const result = handlers[channel];
    if (result instanceof Error) {
      throw result;
    }
    return result;
  };
  vi.mocked(electron.ipcRenderer.invoke).mockImplementation(invoke);
}

describe('ConnectionStatus', () => {
  it('shows a spinner while the initial health check is in flight', () => {
    // A promise that never settles keeps the component in its loading state.
    vi.mocked(electron.ipcRenderer.invoke).mockImplementation(() => new Promise(() => {}));

    render(<ConnectionStatus />);

    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.queryByText('Connected')).not.toBeInTheDocument();
    expect(screen.queryByText('Offline')).not.toBeInTheDocument();
  });

  it('shows Connected and the authenticated user name when health and user checks succeed', async () => {
    stubApi({
      'api:health': {
        connected: true,
        status: 200,
        data: {
          status: 'ok',
          timestamp: '2026-01-01T00:00:00Z',
          version: '1.0.0'
        }
      },
      'api:user': {
        success: true,
        data: {
          name: 'FORGE\\rhys',
          authenticationType: 'Negotiate',
          isAuthenticated: true
        }
      }
    });

    render(<ConnectionStatus />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('FORGE\\rhys')).toBeInTheDocument();
    expect(screen.queryByText('Connecting...')).not.toBeInTheDocument();
  });

  it('shows Connected without a user when authentication fails', async () => {
    stubApi({
      'api:health': {
        connected: true,
        status: 200,
        data: {
          status: 'ok',
          timestamp: '2026-01-01T00:00:00Z',
          version: '1.0.0'
        }
      },
      'api:user': { success: false, error: 'Kerberos ticket expired' }
    });

    render(<ConnectionStatus />);

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    // No user block is rendered when the user lookup fails.
    expect(screen.queryByText(/\\/)).not.toBeInTheDocument();
  });

  it('shows Offline when the API server is unreachable', async () => {
    stubApi({
      'api:health': { connected: false, status: 0, data: null }
    });

    render(<ConnectionStatus />);

    const offline = await screen.findByText('Offline');
    expect(offline).toBeInTheDocument();
    expect(offline.closest('div[title]')).toHaveAttribute('title', 'API server unreachable');
  });

  it('shows Offline when the health check itself throws', async () => {
    stubApi({
      'api:health': new Error('ipc failure')
    });

    render(<ConnectionStatus />);

    const offline = await screen.findByText('Offline');
    expect(offline.closest('div[title]')).toHaveAttribute('title', 'Connection check failed');
  });
});
