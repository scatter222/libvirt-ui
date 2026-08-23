import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain, shell } from '../../mocks/electron';

const CONFIG_YAML = `
webapps:
  - id: kibana
    name: Kibana
    displayName: Kibana
    description: Dashboards
    url: http://kibana.test:5601
    category: siem
    tags: [elastic]
  - id: cyberchef
    name: CyberChef
    displayName: CyberChef
    description: Data wrangling
    url: http://chef.test:8080
    category: analysis
    tags: [encoding]
settings:
  checkStatus: true
  statusCheckInterval: 30000
`;

describe('webappsIPC', () => {
  beforeAll(async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'webapps-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/webapps.yaml'), CONFIG_YAML);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/webappsIPC');
    mod.setupWebAppsIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists apps from the yaml config with live status from a HEAD probe', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'http://kibana.test:5601') return { ok: true };
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchMock);

    const apps = await ipcMain.invoke('webapps:list') as Array<{ id: string; status: string }>;
    expect(apps.map((a) => [a.id, a.status])).toEqual([
      ['kibana', 'online'],
      ['cyberchef', 'offline']
    ]);

    // The statuses above can only come from the stub (kibana.test does not
    // resolve for the real fetch); assert the probe contract explicitly too.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith('http://kibana.test:5601', expect.objectContaining({ method: 'HEAD' }));
    expect(fetchMock).toHaveBeenCalledWith('http://chef.test:8080', expect.objectContaining({ method: 'HEAD' }));
  });

  it('reports a reachable-but-erroring app as offline (non-ok response)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));

    const result = await ipcMain.invoke('webapps:check-status', {}, 'http://kibana.test:5601');
    expect(result).toEqual({ status: 'offline', success: true });
  });

  it('filters apps by category', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));

    const apps = await ipcMain.invoke('webapps:by-category', {}, 'analysis') as Array<{ id: string }>;
    expect(apps.map((a) => a.id)).toEqual(['cyberchef']);
  });

  it('opens an app in the external browser', async () => {
    const result = await ipcMain.invoke('webapps:open', {}, 'http://kibana.test:5601');
    expect(result).toEqual({ success: true });
    expect(vi.mocked(shell.openExternal)).toHaveBeenCalledExactlyOnceWith('http://kibana.test:5601');
  });

  it('wraps browser-open failures in a descriptive error', async () => {
    vi.mocked(shell.openExternal).mockRejectedValueOnce(new Error('no handler'));
    await expect(ipcMain.invoke('webapps:open', {}, 'http://x.test')).rejects.toThrow('Failed to open web app: no handler');
  });

  it('falls back to the built-in catalog when the config file is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default catalog has checkStatus enabled; every probe fails → offline
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));

    const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'webapps-ipc-empty-'));
    // resetModules gives the re-imported module a fresh electron mock too, so
    // the fresh ipcMain instance must be used for the invocations
    vi.resetModules();
    const fresh = await import('../../mocks/electron');
    fresh.app.setAppPath(emptyDir);
    const mod = await import('@/ipc/webappsIPC');
    mod.setupWebAppsIPC();

    const apps = await fresh.ipcMain.invoke('webapps:list') as Array<{ id: string; status: string }>;
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.map((a) => a.id)).toContain('splunk');
    expect(new Set(apps.map((a) => a.status))).toEqual(new Set(['offline']));
    error.mockRestore();
  });
});
