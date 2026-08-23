import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain } from '../../mocks/electron';
import { stubNetRequest } from '../../setup/net-stub';

// NOTE: rulesIPC talks to the server via electron.net.request (Chromium's
// network stack, for Negotiate auth) — NOT global fetch and NOT node-fetch.
// Stubbing fetch has no effect here; stubNetRequest is the right lever.

const CONFIG_YAML = `
rules:
  baseUrl: http://rules.test:5000
  timeout: 10000
  basePath: /api/rules
`;

let tmpDir: string;

describe('rulesIPC', () => {
  beforeAll(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'rules-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/rules.yaml'), CONFIG_YAML);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/rulesIPC');
    mod.setupRulesIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers rule sets from the configured server', async () => {
    const sets = [{ id: 'yara', name: 'YARA' }, { id: 'suricata', name: 'Suricata' }];
    const requests = stubNetRequest(() => ({ status: 200, body: JSON.stringify(sets) }));

    const result = await ipcMain.invoke('rules:sets');
    expect(result).toEqual({ success: true, data: sets });
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('http://rules.test:5000/api/rules/sets');
  });

  it('lists and fetches files under the set, URL-encoding both path segments', async () => {
    const requests = stubNetRequest(() => ({ status: 200, body: JSON.stringify({ content: 'alert tcp' }) }));

    await ipcMain.invoke('rules:list', {}, 'suricata');
    const result = await ipcMain.invoke('rules:get', {}, 'my set', 'evil rule.rules');

    expect(result).toEqual({ success: true, data: { content: 'alert tcp' } });
    expect(requests.map((r) => r.url.replace('http://rules.test:5000', ''))).toEqual([
      '/api/rules/suricata/files',
      '/api/rules/my%20set/files/evil%20rule.rules'
    ]);
  });

  it('uploads a rule file as JSON and flags 409 responses as conflicts', async () => {
    const requests = stubNetRequest(() => ({ status: 409, body: '' }));

    const payload = { name: 'evil.yar', content: 'rule evil {}', overwrite: false };
    const result = await ipcMain.invoke('rules:upload', {}, 'yara', payload);

    expect(result).toEqual({
      success: false,
      status: 409,
      conflict: true,
      error: 'File already exists.'
    });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(requests[0].body)).toEqual(payload);
  });

  it('deletes a rule file via the DELETE endpoint', async () => {
    const requests = stubNetRequest(() => ({ status: 204 }));

    const result = await ipcMain.invoke('rules:delete', {}, 'yara', 'old.yar');
    expect(result).toEqual({ success: true });
    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].url).toBe('http://rules.test:5000/api/rules/yara/files/old.yar');
  });

  it('extracts the structured error from failure responses', async () => {
    stubNetRequest(() => ({ status: 500, body: JSON.stringify({ error: 'disk full' }) }));

    const result = await ipcMain.invoke('rules:sets');
    expect(result).toEqual({ success: false, status: 500, error: 'disk full' });
  });

  it('passes the guest-agent result through on failed service restarts', async () => {
    const restartResult = { exitCode: 1, stdout: '', stderr: 'unit not found' };
    const requests = stubNetRequest(() => ({ status: 502, body: JSON.stringify(restartResult) }));

    const result = await ipcMain.invoke('rules:restart', {}, 'suricata');
    // 502 carries the structured stdout/stderr/exit payload for the UI
    expect(result).toEqual({
      success: false,
      status: 502,
      data: restartResult,
      error: undefined
    });
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toBe('http://rules.test:5000/api/rules/suricata/restart');
  });

  it('reports connection failures without a status field', async () => {
    stubNetRequest(() => new Error('ECONNREFUSED'));

    // The catch path intentionally has no `status` — only success and error
    const result = await ipcMain.invoke('rules:sets');
    expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
  });

  it('caches the config and re-reads it only after reload-config', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'config/rules.yaml'),
      CONFIG_YAML.replace('http://rules.test:5000', 'http://other.test:9999')
    );
    const before = await ipcMain.invoke('rules:get-config') as { config: { rules: { baseUrl: string } } };
    expect(before.config.rules.baseUrl).toBe('http://rules.test:5000');

    const after = await ipcMain.invoke('rules:reload-config') as { config: { rules: { baseUrl: string } } };
    expect(after.config.rules.baseUrl).toBe('http://other.test:9999');

    const requests = stubNetRequest(() => ({ status: 200, body: '[]' }));
    await ipcMain.invoke('rules:sets');
    expect(requests[0].url).toBe('http://other.test:9999/api/rules/sets');
  });
});
