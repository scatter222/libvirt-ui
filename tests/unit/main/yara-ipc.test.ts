import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain } from '../../mocks/electron';
import { stubNetRequest } from '../../setup/net-stub';

const CONFIG_YAML = `
yara:
  baseUrl: http://yara.test:5000
  timeout: 10000
  endpoints:
    list: /api/yara/rules
    get: /api/yara/rules
    upload: /api/yara/rules
    delete: /api/yara/rules
`;

let tmpDir: string;

describe('yaraIPC', () => {
  beforeAll(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'yara-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/yara.yaml'), CONFIG_YAML);

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/yaraIPC');
    mod.setupYaraIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists rules from the configured server URL', async () => {
    const requests = stubNetRequest(() => ({ status: 200, body: JSON.stringify({ files: ['a.yar', 'b.yar'] }) }));

    const result = await ipcMain.invoke('yara:list');
    expect(result).toEqual({ success: true, data: { files: ['a.yar', 'b.yar'] } });
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toBe('http://yara.test:5000/api/yara/rules');
  });

  it('URL-encodes filenames when fetching a single rule', async () => {
    const requests = stubNetRequest(() => ({ status: 200, body: JSON.stringify({ content: 'rule x {}' }) }));

    const result = await ipcMain.invoke('yara:get', {}, 'my rules/evil.yar');
    expect(result).toEqual({ success: true, data: { content: 'rule x {}' } });
    expect(requests[0].url).toBe('http://yara.test:5000/api/yara/rules/my%20rules%2Fevil.yar');
  });

  it('extracts the server error message on failure responses', async () => {
    stubNetRequest(() => ({ status: 500, body: JSON.stringify({ error: 'disk full' }) }));

    const result = await ipcMain.invoke('yara:list');
    expect(result).toEqual({ success: false, status: 500, error: 'disk full' });
  });

  it('uploads a rule as JSON and flags 409 responses as conflicts', async () => {
    const requests = stubNetRequest(() => ({ status: 409, body: '' }));

    const payload = { name: 'evil.yar', content: 'rule evil {}', overwrite: false };
    const result = await ipcMain.invoke('yara:upload', {}, payload);

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

  it('deletes a rule via the DELETE endpoint', async () => {
    const requests = stubNetRequest(() => ({ status: 204 }));

    const result = await ipcMain.invoke('yara:delete', {}, 'old.yar');
    expect(result).toEqual({ success: true });
    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].url).toBe('http://yara.test:5000/api/yara/rules/old.yar');
  });

  it('reports connection failures as unsuccessful instead of throwing', async () => {
    stubNetRequest(() => new Error('ECONNREFUSED'));

    const result = await ipcMain.invoke('yara:list');
    expect(result).toEqual({ success: false, error: 'ECONNREFUSED' });
  });

  it('caches the config and re-reads it only after reload-config', async () => {
    stubNetRequest(() => ({ status: 200, body: '[]' }));

    // Rewrite the config on disk; the cached copy must still be served
    await fs.promises.writeFile(
      path.join(tmpDir, 'config/yara.yaml'),
      CONFIG_YAML.replace('http://yara.test:5000', 'http://other.test:9999')
    );
    const before = await ipcMain.invoke('yara:get-config') as { config: { yara: { baseUrl: string } } };
    expect(before.config.yara.baseUrl).toBe('http://yara.test:5000');

    const after = await ipcMain.invoke('yara:reload-config') as { config: { yara: { baseUrl: string } } };
    expect(after.config.yara.baseUrl).toBe('http://other.test:9999');

    const requests = stubNetRequest(() => ({ status: 200, body: '[]' }));
    await ipcMain.invoke('yara:list');
    expect(requests[0].url).toBe('http://other.test:9999/api/yara/rules');
  });
});
