import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain, shell } from '../../mocks/electron';

/**
 * These tests run the REAL node-fetch against real local servers — nothing on
 * the HTTP path is mocked. The https server presents the self-signed
 * certificate from tests/fixtures/tls, so the "online" result for it proves
 * the probe's rejectUnauthorized:false agent works: with certificate
 * validation on, that probe would fail and read as offline.
 */

const tlsDir = path.resolve(import.meta.dirname, '../../fixtures/tls');

let httpsServer: https.Server;
let httpServer: http.Server;
let httpsUrl: string;
let httpErrorUrl: string;
let deadUrl: string;

function listen (server: https.Server | http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const proto = server instanceof https.Server ? 'https' : 'http';
      resolve(`${proto}://127.0.0.1:${port}`);
    });
  });
}

describe('webappsIPC', () => {
  beforeAll(async () => {
    // A healthy app behind a self-signed certificate
    httpsServer = https.createServer(
      {
        cert: await fs.promises.readFile(path.join(tlsDir, 'cert.pem')),
        key: await fs.promises.readFile(path.join(tlsDir, 'key.pem'))
      },
      (_req, res) => { res.writeHead(200); res.end(); }
    );
    httpsUrl = await listen(httpsServer);

    // A reachable app that answers with a server error
    httpServer = http.createServer((_req, res) => { res.writeHead(500); res.end(); });
    const httpUrl = await listen(httpServer);
    httpErrorUrl = `${httpUrl}/error`;

    // A port that nothing listens on (opened once to find a free one, then closed)
    const probe = http.createServer();
    deadUrl = await listen(probe);
    await new Promise((resolve) => probe.close(resolve));

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'webapps-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/webapps.yaml'), `
webapps:
  - id: kibana
    name: Kibana
    displayName: Kibana
    description: Dashboards (self-signed TLS)
    url: ${httpsUrl}
    category: siem
    tags: [elastic]
  - id: broken
    name: Broken
    displayName: Broken App
    description: Answers 500
    url: ${httpErrorUrl}
    category: siem
    tags: []
  - id: down
    name: Down
    displayName: Down App
    description: Nothing listens here
    url: ${deadUrl}
    category: analysis
    tags: []
settings:
  checkStatus: true
  statusCheckInterval: 30000
`);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/webappsIPC');
    mod.setupWebAppsIPC();
  });

  afterAll(async () => {
    await new Promise((resolve) => httpsServer.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('probes each app for real: self-signed https is online, 500s and dead ports are offline', async () => {
    const apps = await ipcMain.invoke('webapps:list') as Array<{ id: string; status: string }>;

    expect(apps.map((a) => [a.id, a.status])).toEqual([
      // Online despite the untrusted certificate — the relaxed agent at work
      ['kibana', 'online'],
      // Reachable but erroring → offline
      ['broken', 'offline'],
      // Connection refused → offline
      ['down', 'offline']
    ]);
  });

  it('check-status answers for a single URL', async () => {
    expect(await ipcMain.invoke('webapps:check-status', {}, httpsUrl))
      .toEqual({ status: 'online', success: true });
    expect(await ipcMain.invoke('webapps:check-status', {}, deadUrl))
      .toEqual({ status: 'offline', success: true });
  });

  it('filters apps by category', async () => {
    const apps = await ipcMain.invoke('webapps:by-category', {}, 'analysis') as Array<{ id: string }>;
    expect(apps.map((a) => a.id)).toEqual(['down']);
  });

  it('opens an app in the external browser', async () => {
    const result = await ipcMain.invoke('webapps:open', {}, httpsUrl);
    expect(result).toEqual({ success: true });
    expect(vi.mocked(shell.openExternal)).toHaveBeenCalledExactlyOnceWith(httpsUrl);
  });

  it('wraps browser-open failures in a descriptive error', async () => {
    vi.mocked(shell.openExternal).mockRejectedValueOnce(new Error('no handler'));
    await expect(ipcMain.invoke('webapps:open', {}, 'http://x.test')).rejects.toThrow('Failed to open web app: no handler');
  });

  it('falls back to the built-in catalog when the config file is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    // Default catalog URLs point at local dev ports; statuses come from real
    // probes, so assert only that every app got probed to a definite state
    for (const webApp of apps) {
      expect(['online', 'offline']).toContain(webApp.status);
    }
    error.mockRestore();
  });
});
