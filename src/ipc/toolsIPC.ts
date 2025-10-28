import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, shell } from 'electron';
import * as yaml from 'yaml';

const readFile = promisify(fs.readFile);

// Get config path
const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/tools.yaml')
  : path.join(app.getAppPath(), 'config/tools.yaml');

interface ToolLaunch {
  type: 'terminal' | 'gui';
  command: string;
  requiresSudo: boolean;
}

interface ToolDocumentation {
  quickStart: string;
  examples: Array<{
    description: string;
    command: string;
  }>;
}

interface Tool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  tags: string[];
  launch: ToolLaunch;
  documentation: ToolDocumentation;
}

interface ToolCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

interface Mission {
  id: string;
  name: string;
  description: string;
  categories: string[];
}

interface ToolsConfig {
  categories: ToolCategory[];
  missions: Mission[];
  tools: Tool[];
  settings: {
    defaultTerminal: string;
    defaultLaunchMode: string;
    autoRefresh: boolean;
    refreshInterval: number;
  };
}

async function loadToolsConfig (): Promise<ToolsConfig> {
  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    return yaml.parse(fileContents) as ToolsConfig;
  } catch (error) {
    console.error('Failed to load tools configuration:', error);
    return {
      categories: [],
      missions: [],
      tools: [],
      settings: {
        defaultTerminal: 'gnome-terminal',
        defaultLaunchMode: 'terminal',
        autoRefresh: true,
        refreshInterval: 5000
      }
    };
  }
}

export function setupToolsIPC (): void {
  // Get all tools
  ipcMain.handle('tools:list', async () => {
    try {
      const config = await loadToolsConfig();
      return config.tools;
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  });

  // Get categories
  ipcMain.handle('tools:categories', async () => {
    try {
      const config = await loadToolsConfig();
      return config.categories;
    } catch (error) {
      console.error('Failed to get categories:', error);
      return [];
    }
  });

  // Get missions
  ipcMain.handle('tools:missions', async () => {
    try {
      const config = await loadToolsConfig();
      return config.missions;
    } catch (error) {
      console.error('Failed to get missions:', error);
      return [];
    }
  });

  // Get tools by category
  ipcMain.handle('tools:by-category', async (_, categoryId: string) => {
    try {
      const config = await loadToolsConfig();
      return config.tools.filter((tool) => tool.category === categoryId);
    } catch (error) {
      console.error('Failed to get tools by category:', error);
      return [];
    }
  });

  // Get tools for mission
  ipcMain.handle('tools:by-mission', async (_, missionId: string) => {
    try {
      const config = await loadToolsConfig();
      const mission = config.missions.find((m) => m.id === missionId);
      if (!mission) return [];

      return config.tools.filter((tool) => mission.categories.includes(tool.category));
    } catch (error) {
      console.error('Failed to get tools by mission:', error);
      return [];
    }
  });

  // Launch a tool
  ipcMain.handle('tools:launch', async (_, toolId: string) => {
    try {
      const config = await loadToolsConfig();
      const tool = config.tools.find((t) => t.id === toolId);

      if (!tool) {
        throw new Error(`Tool not found: ${toolId}`);
      }

      const { defaultTerminal } = config.settings;

      if (tool.launch.type === 'terminal') {
        // Launch in terminal
        const terminalCommand = tool.launch.requiresSudo
          ? `sudo ${tool.launch.command}`
          : tool.launch.command;

        // Different terminal emulators have different syntax
        let terminalArgs: string[] = [];
        switch (defaultTerminal) {
          case 'gnome-terminal':
            terminalArgs = [
              '--',
              'bash',
              '-c',
`${terminalCommand}; echo "Press any key to exit..."; read`
            ];
            break;
          case 'konsole':
            terminalArgs = [
              '-e',
              'bash',
              '-c',
`${terminalCommand}; echo "Press any key to exit..."; read`
            ];
            break;
          case 'xterm':
            terminalArgs = [
              '-e',
              'bash',
              '-c',
`${terminalCommand}; echo "Press any key to exit..."; read`
            ];
            break;
          default:
            terminalArgs = ['-e', terminalCommand];
        }

        const child = spawn(defaultTerminal, terminalArgs, {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      } else {
        // Launch GUI application
        const command = tool.launch.requiresSudo
          ? 'pkexec' // Use pkexec for GUI apps that need root
          : tool.launch.command;

        const args = tool.launch.requiresSudo
          ? [tool.launch.command]
          : [];

        const child = spawn(command, args, {
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to launch tool: ${errorMessage}`);
    }
  });

  // Open documentation in browser
  ipcMain.handle('tools:open-docs', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open documentation: ${errorMessage}`);
    }
  });

  // Reload configuration
  ipcMain.handle('tools:reload-config', async () => {
    try {
      const config = await loadToolsConfig();
      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload configuration: ${errorMessage}`);
    }
  });
}
