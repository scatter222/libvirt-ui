import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, net } from 'electron';
import * as yaml from 'yaml';

const readFile = promisify(fs.readFile);

const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/yara.yaml')
  : path.join(app.getAppPath(), 'config/yara.yaml');

interface YaraConfig {
  yara: {
    baseUrl: string;
    timeout: number;
    endpoints: {
      list: string;
      get: string;
      upload: string;
      delete: string;
    };
  };
}

interface YaraResponse {
  status: number;
  body: unknown;
}

let yaraConfig: YaraConfig | null = null;

async function loadYaraConfig (): Promise<YaraConfig> {
  if (yaraConfig) return yaraConfig;

  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    yaraConfig = yaml.parse(fileContents) as YaraConfig;
    return yaraConfig;
  } catch (error) {
    console.error('Failed to load YARA configuration:', error);
    return {
      yara: {
        baseUrl: 'http://localhost:5000',
        timeout: 10000,
        endpoints: {
          list: '/api/yara/rules',
          get: '/api/yara/rules',
          upload: '/api/yara/rules',
          delete: '/api/yara/rules'
        }
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

function yaraRequest (url: string, method: string, body?: unknown): Promise<YaraResponse> {
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

export function setupYaraIPC (): void {
  // List rule files in the server folder.
  ipcMain.handle('yara:list', async () => {
    try {
      const config = await loadYaraConfig();
      const url = `${config.yara.baseUrl}${config.yara.endpoints.list}`;
      const res = await yaraRequest(url, 'GET');
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Get content of a specific rule file.
  ipcMain.handle('yara:get', async (_event, filename: string) => {
    try {
      const config = await loadYaraConfig();
      const url = `${config.yara.baseUrl}${config.yara.endpoints.get}/${encodeURIComponent(filename)}`;
      const res = await yaraRequest(url, 'GET');
      if (res.status >= 200 && res.status < 300) {
        return { success: true, data: res.body };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Upload (create or overwrite) a rule file.
  ipcMain.handle('yara:upload', async (
    _event,
    payload: { name: string; content: string; overwrite: boolean }
  ) => {
    try {
      const config = await loadYaraConfig();
      const url = `${config.yara.baseUrl}${config.yara.endpoints.upload}`;
      const res = await yaraRequest(url, 'POST', payload);
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
  ipcMain.handle('yara:delete', async (_event, filename: string) => {
    try {
      const config = await loadYaraConfig();
      const url = `${config.yara.baseUrl}${config.yara.endpoints.delete}/${encodeURIComponent(filename)}`;
      const res = await yaraRequest(url, 'DELETE');
      if (res.status >= 200 && res.status < 300) {
        return { success: true };
      }
      return { success: false, status: res.status, error: extractError(res.body) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Reload the YARA config file from disk.
  ipcMain.handle('yara:reload-config', async () => {
    yaraConfig = null;
    const config = await loadYaraConfig();
    return { success: true, config };
  });

  // Return the current config (useful for showing the configured URL in the UI).
  ipcMain.handle('yara:get-config', async () => {
    const config = await loadYaraConfig();
    return { success: true, config };
  });
}
