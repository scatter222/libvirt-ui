import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { handleFeatureIpc } from '@/modes/appMode';

import { app, shell } from 'electron';

const readFile = promisify(fs.readFile);

// Get config path. The tools catalog is a JSON document generated from the
// per-system tool reference sheets (FLARE-VM, REMnux, SIFT, Parrot OS).
const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/tools.json')
  : path.join(app.getAppPath(), 'config/tools.json');

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
  // Which system/VM the tool lives on (references System.id).
  system: string;
  category: string;
  interface: 'cli' | 'gui';
  isDefault?: boolean;
  requiresSudo?: boolean;
  tags: string[];
  documentation: ToolDocumentation;
}

interface ToolCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
}

// A system is a VM in the lab that ships a particular tool suite.
interface System {
  id: string;
  name: string;
  os: string;
  color: string;
  icon: string;
  description: string;
}

interface Mission {
  id: string;
  name: string;
  description: string;
  categories: string[];
}

interface ToolsConfig {
  systems: System[];
  categories: ToolCategory[];
  missions: Mission[];
  tools: Tool[];
  settings: Record<string, unknown>;
}

async function loadToolsConfig (): Promise<ToolsConfig> {
  try {
    const fileContents = await readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(fileContents) as ToolsConfig;
  } catch (error) {
    console.error('Failed to load tools configuration:', error);
    return {
      systems: [],
      categories: [],
      missions: [],
      tools: [],
      settings: {}
    };
  }
}

export function setupToolsIPC (): void {
  // Get all tools
  handleFeatureIpc('tools', 'tools:list', async () => {
    try {
      const config = await loadToolsConfig();
      return config.tools;
    } catch (error) {
      console.error('Failed to list tools:', error);
      return [];
    }
  });

  // Get categories
  handleFeatureIpc('tools', 'tools:categories', async () => {
    try {
      const config = await loadToolsConfig();
      return config.categories;
    } catch (error) {
      console.error('Failed to get categories:', error);
      return [];
    }
  });

  // Get systems (the VMs each tool set lives on)
  handleFeatureIpc('tools', 'tools:systems', async () => {
    try {
      const config = await loadToolsConfig();
      return config.systems;
    } catch (error) {
      console.error('Failed to get systems:', error);
      return [];
    }
  });

  // Get missions
  handleFeatureIpc('tools', 'tools:missions', async () => {
    try {
      const config = await loadToolsConfig();
      return config.missions;
    } catch (error) {
      console.error('Failed to get missions:', error);
      return [];
    }
  });

  // Get tools by category
  handleFeatureIpc('tools', 'tools:by-category', async (_, categoryId: string) => {
    try {
      const config = await loadToolsConfig();
      return config.tools.filter((tool) => tool.category === categoryId);
    } catch (error) {
      console.error('Failed to get tools by category:', error);
      return [];
    }
  });

  // Get tools by system
  handleFeatureIpc('tools', 'tools:by-system', async (_, systemId: string) => {
    try {
      const config = await loadToolsConfig();
      return config.tools.filter((tool) => tool.system === systemId);
    } catch (error) {
      console.error('Failed to get tools by system:', error);
      return [];
    }
  });

  // Get tools for mission
  handleFeatureIpc('tools', 'tools:by-mission', async (_, missionId: string) => {
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

  // Open documentation in browser
  handleFeatureIpc('tools', 'tools:open-docs', async (_, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open documentation: ${errorMessage}`);
    }
  });

  // Reload configuration
  handleFeatureIpc('tools', 'tools:reload-config', async () => {
    try {
      const config = await loadToolsConfig();
      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload configuration: ${errorMessage}`);
    }
  });
}
