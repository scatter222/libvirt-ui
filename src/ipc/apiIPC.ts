import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, net } from 'electron';
import * as yaml from 'yaml';

const readFile = promisify(fs.readFile);

const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/api.yaml')
  : path.join(app.getAppPath(), 'config/api.yaml');

interface ApiConfig {
  api: {
    baseUrl: string;
    timeout: number;
    auth: {
      method: string;
    };
  };
}

let apiConfig: ApiConfig | null = null;

async function loadApiConfig (): Promise<ApiConfig> {
  if (apiConfig) return apiConfig;

  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    apiConfig = yaml.parse(fileContents) as ApiConfig;
    return apiConfig;
  } catch (error) {
    console.error('Failed to load API configuration:', error);
    return {
      api: {
        baseUrl: 'https://api.lab.forge.local:9444',
        timeout: 10000,
        auth: {
          method: 'negotiate'
        }
      }
    };
  }
}

/**
 * Makes an authenticated request to the API server using Electron's net module.
 * Electron's net.request() supports Negotiate/Kerberos auth natively when
 * the app is configured with --auth-server-whitelist.
 */
async function apiRequest (endpoint: string, method: string = 'GET'): Promise<unknown> {
  const config = await loadApiConfig();
  const url = `${config.api.baseUrl}${endpoint}`;

  return new Promise((resolve, reject) => {
    const request = net.request({
      method,
      url
    });

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(responseData));
          } catch {
            resolve(responseData);
          }
        } else if (response.statusCode === 401) {
          reject(new Error('Authentication failed. Ensure you have a valid Kerberos ticket (run kinit).'));
        } else {
          reject(new Error(`API request failed: ${response.statusCode} ${responseData}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`API connection failed: ${error.message}`));
    });

    request.end();
  });
}

export function setupApiIPC (): void {
  // Health check (unauthenticated)
  ipcMain.handle('api:health', async () => {
    try {
      const config = await loadApiConfig();
      const url = `${config.api.baseUrl}/api/health`;

      return new Promise((resolve) => {
        const request = net.request({ method: 'GET', url });
        let data = '';

        request.on('response', (response) => {
          response.on('data', (chunk) => { data += chunk.toString(); });
          response.on('end', () => {
            resolve({
              connected: response.statusCode === 200,
              status: response.statusCode,
              data: data ? JSON.parse(data) : null
            });
          });
        });

        request.on('error', () => {
          resolve({ connected: false, status: 0, data: null });
        });

        request.end();
      });
    } catch {
      return { connected: false, status: 0, data: null };
    }
  });

  // Get authenticated user info
  ipcMain.handle('api:user', async () => {
    try {
      const result = await apiRequest('/api/user');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Get tools from server
  ipcMain.handle('api:tools', async () => {
    try {
      const result = await apiRequest('/api/tools');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Notify server of a tool launch
  ipcMain.handle('api:launch-tool', async (_, toolId: string) => {
    try {
      const result = await apiRequest(`/api/tools/${toolId}/launch`, 'POST');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Get session info
  ipcMain.handle('api:session', async () => {
    try {
      const result = await apiRequest('/api/session');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Reload API config
  ipcMain.handle('api:reload-config', async () => {
    apiConfig = null;
    try {
      const config = await loadApiConfig();
      return { success: true, config };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });
}
