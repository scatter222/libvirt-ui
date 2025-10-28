import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, shell } from 'electron';
import * as yaml from 'yaml';

const readFile = promisify(fs.readFile);

// Get config path
const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/webapps.yaml')
  : path.join(app.getAppPath(), 'config/webapps.yaml');

interface WebApp {
  id: string;
  name: string;
  displayName: string;
  description: string;
  url: string;
  category: string;
  tags: string[];
  icon?: string;
  requiresAuth?: boolean;
  status?: 'online' | 'offline' | 'unknown';
}

interface WebAppsConfig {
  webapps: WebApp[];
  settings?: {
    checkStatus?: boolean;
    statusCheckInterval?: number;
    openInDefaultBrowser?: boolean;
  };
}

async function loadWebAppsConfig (): Promise<WebAppsConfig> {
  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    return yaml.parse(fileContents) as WebAppsConfig;
  } catch (error) {
    console.error('Failed to load web apps configuration:', error);
    // Return default web apps if config doesn't exist
    return {
      webapps: [
        {
          id: 'splunk',
          name: 'Splunk',
          displayName: 'Splunk Enterprise',
          description: 'Search, monitor, and analyze machine data',
          url: 'http://localhost:8000',
          category: 'siem',
          tags: [
            'siem',
            'logs',
            'monitoring',
            'analytics'
          ],
          icon: '📊',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'arkime',
          name: 'Arkime',
          displayName: 'Arkime (Moloch)',
          description: 'Large scale, open source, indexed packet capture and search',
          url: 'http://localhost:8005',
          category: 'network',
          tags: [
            'pcap',
            'network',
            'forensics',
            'packet-analysis'
          ],
          icon: '🔍',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'kibana',
          name: 'Kibana',
          displayName: 'Kibana',
          description: 'Elasticsearch data visualization and exploration',
          url: 'http://localhost:5601',
          category: 'siem',
          tags: [
            'elastic',
            'visualization',
            'logs',
            'dashboard'
          ],
          icon: '📈',
          requiresAuth: false,
          status: 'unknown'
        },
        {
          id: 'grafana',
          name: 'Grafana',
          displayName: 'Grafana',
          description: 'Open source analytics and interactive visualization',
          url: 'http://localhost:3000',
          category: 'monitoring',
          tags: [
            'metrics',
            'visualization',
            'monitoring',
            'dashboard'
          ],
          icon: '📉',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'cyberchef',
          name: 'CyberChef',
          displayName: 'CyberChef',
          description: 'The Cyber Swiss Army Knife for encoding, decoding, and analyzing data',
          url: 'http://localhost:8080/cyberchef',
          category: 'analysis',
          tags: [
            'encoding',
            'decoding',
            'crypto',
            'analysis'
          ],
          icon: '🔐',
          requiresAuth: false,
          status: 'unknown'
        },
        {
          id: 'misp',
          name: 'MISP',
          displayName: 'MISP Threat Sharing',
          description: 'Threat intelligence platform for sharing, storing and correlating IOCs',
          url: 'http://localhost:8443',
          category: 'threat-intel',
          tags: [
            'threat-intel',
            'ioc',
            'sharing',
            'correlation'
          ],
          icon: '🌐',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'thehive',
          name: 'TheHive',
          displayName: 'TheHive',
          description: 'Security incident response platform',
          url: 'http://localhost:9000',
          category: 'incident-response',
          tags: [
            'incident-response',
            'case-management',
            'collaboration'
          ],
          icon: '🐝',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'cortex',
          name: 'Cortex',
          displayName: 'Cortex',
          description: 'Observable analysis and active response engine',
          url: 'http://localhost:9001',
          category: 'analysis',
          tags: [
            'analysis',
            'automation',
            'observables'
          ],
          icon: '🧠',
          requiresAuth: true,
          status: 'unknown'
        },
        {
          id: 'openvas',
          name: 'OpenVAS',
          displayName: 'OpenVAS/Greenbone',
          description: 'Open source vulnerability assessment scanner',
          url: 'http://localhost:9392',
          category: 'vulnerability',
          tags: [
            'vulnerability',
            'scanner',
            'assessment'
          ],
          icon: '🛡️',
          requiresAuth: true,
          status: 'unknown'
        }
      ],
      settings: {
        checkStatus: true,
        statusCheckInterval: 30000,
        openInDefaultBrowser: true
      }
    };
  }
}

// Simple status check function
async function checkWebAppStatus (url: string): Promise<'online' | 'offline'> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });

    clearTimeout(timeout);
    return response.ok ? 'online' : 'offline';
  } catch (error) {
    return 'offline';
  }
}

export function setupWebAppsIPC (): void {
  // Get all web apps
  ipcMain.handle('webapps:list', async () => {
    try {
      const config = await loadWebAppsConfig();

      // Check status if enabled
      if (config.settings?.checkStatus) {
        for (const app of config.webapps) {
          app.status = await checkWebAppStatus(app.url);
        }
      }

      return config.webapps;
    } catch (error) {
      console.error('Failed to list web apps:', error);
      return [];
    }
  });

  // Open web app in browser
  ipcMain.handle('webapps:open', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open web app: ${errorMessage}`);
    }
  });

  // Check web app status
  ipcMain.handle('webapps:check-status', async (_, url: string) => {
    try {
      const status = await checkWebAppStatus(url);
      return { status, success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to check status: ${errorMessage}`);
    }
  });

  // Get web apps by category
  ipcMain.handle('webapps:by-category', async (_, category: string) => {
    try {
      const config = await loadWebAppsConfig();
      return config.webapps.filter((app) => app.category === category);
    } catch (error) {
      console.error('Failed to get web apps by category:', error);
      return [];
    }
  });

  // Reload configuration
  ipcMain.handle('webapps:reload-config', async () => {
    try {
      const config = await loadWebAppsConfig();
      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload web apps configuration: ${errorMessage}`);
    }
  });
}
