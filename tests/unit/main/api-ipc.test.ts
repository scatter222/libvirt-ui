import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain } from '../../mocks/electron';
import { stubNetRequest } from '../../setup/net-stub';

const CONFIG_YAML = `
api:
  baseUrl: https://api.test:9444
  timeout: 10000
  auth:
    method: negotiate
`;

describe('apiIPC', () => {
  beforeAll(async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'api-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/api.yaml'), CONFIG_YAML);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/apiIPC');
    mod.setupApiIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a healthy server with parsed health data', async () => {
    const requests = stubNetRequest(() => ({
      status: 200,
      body: JSON.stringify({ status: 'ok', timestamp: 't', version: '1.0' })
    }));

    const result = await ipcMain.invoke('api:health');
    expect(result).toEqual({
      connected: true,
      status: 200,
      data: { status: 'ok', timestamp: 't', version: '1.0' }
    });
    expect(requests[0].url).toBe('https://api.test:9444/api/health');
  });

  it('reports an unreachable server as disconnected rather than throwing', async () => {
    stubNetRequest(() => new Error('ENOTFOUND'));

    const result = await ipcMain.invoke('api:health');
    expect(result).toEqual({ connected: false, status: 0, data: null });
  });

  it('returns the authenticated user payload', async () => {
    stubNetRequest(() => ({
      status: 200,
      body: JSON.stringify({ name: 'FORGE\\rhys', authenticationType: 'Negotiate', isAuthenticated: true })
    }));

    const result = await ipcMain.invoke('api:user');
    expect(result).toEqual({
      success: true,
      data: { name: 'FORGE\\rhys', authenticationType: 'Negotiate', isAuthenticated: true }
    });
  });

  it('maps 401 responses to a Kerberos hint', async () => {
    stubNetRequest(() => ({ status: 401 }));

    const result = await ipcMain.invoke('api:user');
    expect(result).toEqual({
      success: false,
      error: 'Authentication failed. Ensure you have a valid Kerberos ticket (run kinit).'
    });
  });

  it('surfaces other HTTP failures with status and body', async () => {
    stubNetRequest(() => ({ status: 503, body: 'maintenance' }));

    const result = await ipcMain.invoke('api:tools');
    expect(result).toEqual({ success: false, error: 'API request failed: 503 maintenance' });
  });

  it('notifies the server of tool launches via POST to the tool endpoint', async () => {
    const requests = stubNetRequest(() => ({ status: 200, body: '{}' }));

    const result = await ipcMain.invoke('api:launch-tool', {}, 'nmap');
    expect(result).toEqual({ success: true, data: {} });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.test:9444/api/tools/nmap/launch');
  });
});
