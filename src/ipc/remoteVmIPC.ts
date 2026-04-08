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

let cachedConfig: ApiConfig | null = null;

async function loadApiConfig (): Promise<ApiConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const contents = await readFile(CONFIG_PATH, 'utf8');
    cachedConfig = yaml.parse(contents) as ApiConfig;
    return cachedConfig;
  } catch (_error) {
    return {
      api: {
        baseUrl: 'https://api.lab.forge.local:9444',
        timeout: 10000,
        auth: { method: 'negotiate' }
      }
    };
  }
}

async function apiRequest (endpoint: string, method: string = 'GET', body?: unknown): Promise<unknown> {
  const config = await loadApiConfig();
  const url = `${config.api.baseUrl}${endpoint}`;

  return new Promise((resolve, reject) => {
    const request = net.request({ method, url });

    if (body) {
      request.setHeader('Content-Type', 'application/json');
    }

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

    if (body) {
      request.write(JSON.stringify(body));
    }

    request.end();
  });
}

export interface RemoteVmTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  specs: {
    memory: number;
    cpus: number;
    diskSize: number;
  };
  tags: string[];
}

export interface RemoteVmInstance {
  id: string;
  templateId: string;
  templateName: string;
  owner: string;
  state: 'running' | 'stopped' | 'creating' | 'error';
  createdAt: string;
  consoleType: string;
  consolePort: number;
  specs: {
    memory: number;
    cpus: number;
    diskSize: number;
  };
}

export function setupRemoteVmIPC (): void {
  // List available VM templates on the server
  ipcMain.handle('remote-vms:list-templates', async () => {
    try {
      const result = await apiRequest('/api/vms/templates');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, data: [] };
    }
  });

  // List the current user's VM instances
  ipcMain.handle('remote-vms:list-instances', async () => {
    try {
      const result = await apiRequest('/api/vms/instances');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message, data: [] };
    }
  });

  // Spawn a new VM instance from a template
  ipcMain.handle('remote-vms:spawn', async (_, templateId: string) => {
    try {
      const result = await apiRequest('/api/vms/instances', 'POST', { templateId });
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Start a stopped instance
  ipcMain.handle('remote-vms:start', async (_, instanceId: string) => {
    try {
      const result = await apiRequest(`/api/vms/instances/${instanceId}/start`, 'POST');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Stop a running instance
  ipcMain.handle('remote-vms:stop', async (_, instanceId: string) => {
    try {
      const result = await apiRequest(`/api/vms/instances/${instanceId}/stop`, 'POST');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Restart an instance
  ipcMain.handle('remote-vms:restart', async (_, instanceId: string) => {
    try {
      const result = await apiRequest(`/api/vms/instances/${instanceId}/restart`, 'POST');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Delete an instance
  ipcMain.handle('remote-vms:delete', async (_, instanceId: string) => {
    try {
      const result = await apiRequest(`/api/vms/instances/${instanceId}`, 'DELETE');
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Get console connection info for an instance
  ipcMain.handle('remote-vms:console', async (_, instanceId: string) => {
    try {
      const result = await apiRequest(`/api/vms/instances/${instanceId}/console`);
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Force reload (clear cached config)
  ipcMain.handle('remote-vms:reload', async () => {
    cachedConfig = null;
    return { success: true };
  });
}
