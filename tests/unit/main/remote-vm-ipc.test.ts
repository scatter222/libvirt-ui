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

describe('remoteVmIPC', () => {
  beforeAll(async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'remote-vm-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/api.yaml'), CONFIG_YAML);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/remoteVmIPC');
    mod.setupRemoteVmIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists templates from the server API', async () => {
    const templates = [{ id: 't1', name: 'Kali', specs: { memory: 4096, cpus: 2, diskSize: 40 } }];
    const requests = stubNetRequest(() => ({ status: 200, body: JSON.stringify(templates) }));

    const result = await ipcMain.invoke('remote-vms:list-templates');
    expect(result).toEqual({ success: true, data: templates });
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('https://api.test:9444/api/vms/templates');
  });

  it('degrades list failures to an empty data array so the UI keeps rendering', async () => {
    stubNetRequest(() => new Error('ECONNRESET'));

    const result = await ipcMain.invoke('remote-vms:list-instances');
    expect(result).toEqual({
      success: false,
      error: 'API connection failed: ECONNRESET',
      data: []
    });
  });

  it('spawns an instance by POSTing the template id as JSON', async () => {
    const requests = stubNetRequest(() => ({ status: 201, body: JSON.stringify({ id: 'i-7' }) }));

    const result = await ipcMain.invoke('remote-vms:spawn', {}, 'tpl-kali');
    expect(result).toEqual({ success: true, data: { id: 'i-7' } });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('https://api.test:9444/api/vms/instances');
    expect(requests[0].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(requests[0].body)).toEqual({ templateId: 'tpl-kali' });
  });

  it('routes lifecycle actions to the per-instance endpoints', async () => {
    const requests = stubNetRequest(() => ({ status: 200, body: '{}' }));

    await ipcMain.invoke('remote-vms:start', {}, 'i-7');
    await ipcMain.invoke('remote-vms:stop', {}, 'i-7');
    await ipcMain.invoke('remote-vms:restart', {}, 'i-7');
    await ipcMain.invoke('remote-vms:delete', {}, 'i-7');
    await ipcMain.invoke('remote-vms:console', {}, 'i-7');

    expect(requests.map((r) => [r.method, r.url.replace('https://api.test:9444', '')])).toEqual([
      ['POST', '/api/vms/instances/i-7/start'],
      ['POST', '/api/vms/instances/i-7/stop'],
      ['POST', '/api/vms/instances/i-7/restart'],
      ['DELETE', '/api/vms/instances/i-7'],
      ['GET', '/api/vms/instances/i-7/console']
    ]);
  });

  it('maps 401 responses to the Kerberos hint', async () => {
    stubNetRequest(() => ({ status: 401 }));

    const result = await ipcMain.invoke('remote-vms:spawn', {}, 'tpl-kali');
    expect(result).toEqual({
      success: false,
      error: 'Authentication failed. Ensure you have a valid Kerberos ticket (run kinit).'
    });
  });
});
