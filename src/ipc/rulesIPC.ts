import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, net } from 'electron';
import * as yaml from 'yaml';

const readFile = promisify(fs.readFile);

const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/rules.yaml')
  : path.join(app.getAppPath(), 'config/rules.yaml');

interface RulesConfig {
  rules: {
    baseUrl: string;
    timeout: number;
    basePath: string;
  };
}

interface RulesResponse {
  status: number;
  body: unknown;
}

let rulesConfig: RulesConfig | null = null;

async function loadRulesConfig (): Promise<RulesConfig> {
  if (rulesConfig) return rulesConfig;

  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    rulesConfig = yaml.parse(fileContents) as RulesConfig;
    return rulesConfig;
  } catch (error) {
    console.error('Failed to load rules configuration:', error);
    return {
      rules: {
        baseUrl: 'http://localhost:5000',
        timeout: 10000,
        basePath: '/api/rules'
      }
    };
  }
}

function extractError (body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as Record<string, unknown>).error;
    if (typeof err === 'string') return err;
  }
  if (typeof body === 'string' && body.length) return body;
  return undefined;
}

function rulesRequest (url: string, method: string, body?: unknown): Promise<RulesResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });
    if (body !== undefined) {
      request.setHeader('Content-Type', 'application/json');
    }

    let raw = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => { raw += chunk.toString(); });
      response.on('end', () => {
        let parsed: unknown = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
        }
        resolve({ status: response.statusCode ?? 0, body: parsed });
      });
    });

    request.on('error', (err) => reject(err));
    if (body !== undefined) request.write(JSON.stringify(body));
    request.end();
  });
}

export function setupRulesIPC (): void {
  // List the rule sets exposed by the server (e.g. suricata, yara, zeek).
  ipcMain.handle('rules:sets', async () => {
    try {
      const config = await loadRulesConfig();
      const url = `${config.rules.baseUrl}${config.rules.basePath}/sets`;
      const res = await rulesRequest(url, 'GET');
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // List rule files in a specific set's server folder.
  ipcMain.handle('rules:list', async (_event, setId: string) => {
    try {
      const config = await loadRulesConfig();
      const url = `${config.rules.baseUrl}${config.rules.basePath}/${encodeURIComponent(setId)}/files`;
      const res = await rulesRequest(url, 'GET');
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Get content of a specific rule file.
  ipcMain.handle('rules:get', async (_event, setId: string, filename: string) => {
    try {
      const config = await loadRulesConfig();
      const url = `${config.rules.baseUrl}${config.rules.basePath}/${encodeURIComponent(setId)}/files/${encodeURIComponent(filename)}`;
      const res = await rulesRequest(url, 'GET');
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Upload (create or overwrite) a rule file.
  ipcMain.handle('rules:upload', async (
    _event,
    setId: string,
    payload: { name: string; content: string; overwrite: boolean }
  ) => {
    try {
      const config = await loadRulesConfig();
      const url = `${config.rules.baseUrl}${config.rules.basePath}/${encodeURIComponent(setId)}/files`;
      const res = await rulesRequest(url, 'POST', payload);
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      if (res.status === 409) {
        return {
          success: false,
          status: 409,
          conflict: true,
          error: extractError(res.body) || 'File already exists.'
        };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Delete a rule file.
  ipcMain.handle('rules:delete', async (_event, setId: string, filename: string) => {
    try {
      const config = await loadRulesConfig();
      const url = `${config.rules.baseUrl}${config.rules.basePath}/${encodeURIComponent(setId)}/files/${encodeURIComponent(filename)}`;
      const res = await rulesRequest(url, 'DELETE');
      if (res.status >= 200 && res.status < 300) {
        return { success: true };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Reload the rules config from disk.
  ipcMain.handle('rules:reload-config', async () => {
    rulesConfig = null;
    const config = await loadRulesConfig();
    return { success: true, config };
  });

  // Return the current config (useful for showing the configured URL in the UI).
  ipcMain.handle('rules:get-config', async () => {
    const config = await loadRulesConfig();
    return { success: true, config };
  });
}
