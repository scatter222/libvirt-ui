import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain } from 'electron';
import * as yaml from 'yaml';

const execAsync = promisify(exec);

const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/local-vms.yaml')
  : path.join(app.getAppPath(), 'config/local-vms.yaml');

interface LocalVmTemplate {
  name: string;
  displayName: string;
  description: string;
  category: string;
  ovaFile: string;
  isoFile?: string;
  specs: {
    memory: number;
    cpus: number;
  };
  tags: string[];
}

interface LocalVmsConfig {
  settings: {
    imagesDirectory: string;
    autoRefresh: boolean;
    refreshInterval: number;
  };
  vms: LocalVmTemplate[];
}

export interface LocalVm {
  name: string;
  displayName: string;
  description: string;
  category: string;
  state: 'running' | 'stopped' | 'paused' | 'suspended' | 'available';
  memory: number;
  cpus: number;
  tags: string[];
  ovaPath: string;
  imported: boolean;
}

async function loadConfig (): Promise<LocalVmsConfig> {
  try {
    const contents = await fs.promises.readFile(CONFIG_PATH, 'utf8');
    return yaml.parse(contents) as LocalVmsConfig;
  } catch (_error) {
    console.error('Failed to load local VM config:', _error);
    return {
      settings: {
        imagesDirectory: '/opt/launcher-apps/vms',
        autoRefresh: true,
        refreshInterval: 5000
      },
      vms: []
    };
  }
}

async function vboxManage (args: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`VBoxManage ${args}`);
    return stdout.trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`VBoxManage failed: ${msg}`);
  }
}

async function getRegisteredVms (): Promise<Set<string>> {
  try {
    const output = await vboxManage('list vms');
    const names = new Set<string>();
    for (const line of output.split('\n')) {
      const match = line.match(/^"(.+?)"/);
      if (match) names.add(match[1]);
    }
    return names;
  } catch (_error) {
    return new Set();
  }
}

async function getVmState (vmName: string): Promise<'running' | 'stopped' | 'paused' | 'suspended'> {
  try {
    const output = await vboxManage(`showvminfo "${vmName}" --machinereadable`);
    const match = output.match(/VMState="(.+?)"/);
    if (!match) return 'stopped';

    const state = match[1];
    if (state === 'running') return 'running';
    if (state === 'paused') return 'paused';
    if (state === 'saved') return 'suspended';
    return 'stopped';
  } catch (_error) {
    return 'stopped';
  }
}

export function setupLocalVmIPC (): void {
  ipcMain.handle('local-vms:list', async () => {
    try {
      const config = await loadConfig();
      const registered = await getRegisteredVms();
      const vms: LocalVm[] = [];

      for (const tpl of config.vms) {
        const ovaPath = path.join(config.settings.imagesDirectory, tpl.ovaFile);
        const imported = registered.has(tpl.name);
        let state: LocalVm['state'] = 'available';

        if (imported) {
          state = await getVmState(tpl.name);
        }

        vms.push({
          name: tpl.name,
          displayName: tpl.displayName,
          description: tpl.description,
          category: tpl.category,
          state,
          memory: tpl.specs.memory,
          cpus: tpl.specs.cpus,
          tags: tpl.tags,
          ovaPath,
          imported
        });
      }

      return vms;
    } catch (_error) {
      console.error('Failed to list local VMs:', _error);
      return [];
    }
  });

  ipcMain.handle('local-vms:start', async (_, vmName: string) => {
    const config = await loadConfig();
    const tpl = config.vms.find((v) => v.name === vmName);
    if (!tpl) throw new Error(`VM not found in config: ${vmName}`);

    const registered = await getRegisteredVms();

    if (!registered.has(vmName)) {
      // Import OVA first
      const ovaPath = path.join(config.settings.imagesDirectory, tpl.ovaFile);
      try {
        await fs.promises.access(ovaPath, fs.constants.F_OK);
      } catch {
        throw new Error(`OVA file not found: ${ovaPath}`);
      }

      await vboxManage(`import "${ovaPath}" --vsys 0 --vmname "${vmName}"`);

      // Apply configured specs
      await vboxManage(`modifyvm "${vmName}" --memory ${tpl.specs.memory} --cpus ${tpl.specs.cpus}`);

      // Attach boot ISO if configured (e.g. live distro ISOs)
      if (tpl.isoFile) {
        const isoPath = path.join(config.settings.imagesDirectory, tpl.isoFile);
        try {
          await fs.promises.access(isoPath, fs.constants.F_OK);
          // Ensure IDE controller exists, add if missing
          await vboxManage(`storagectl "${vmName}" --name "IDE" --add ide`).catch(() => {});
          await vboxManage(`storageattach "${vmName}" --storagectl "IDE" --port 0 --device 0 --type dvddrive --medium "${isoPath}"`);
          await vboxManage(`modifyvm "${vmName}" --boot1 dvd --boot2 disk`);
        } catch {
          console.warn(`ISO file not found, skipping: ${isoPath}`);
        }
      }
    }

    await vboxManage(`startvm "${vmName}" --type gui`);
    return { success: true };
  });

  ipcMain.handle('local-vms:stop', async (_, vmName: string, force?: boolean) => {
    const state = await getVmState(vmName);
    if (state !== 'running' && state !== 'paused') {
      return { success: true };
    }
    if (force) {
      await vboxManage(`controlvm "${vmName}" poweroff`);
    } else {
      await vboxManage(`controlvm "${vmName}" acpipowerbutton`);
    }
    return { success: true };
  });

  ipcMain.handle('local-vms:restart', async (_, vmName: string) => {
    const state = await getVmState(vmName);
    if (state !== 'running' && state !== 'paused') {
      await vboxManage(`startvm "${vmName}" --type gui`);
      return { success: true };
    }
    try {
      await vboxManage(`controlvm "${vmName}" reset`);
    } catch (_error) {
      await vboxManage(`controlvm "${vmName}" poweroff`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await vboxManage(`startvm "${vmName}" --type gui`);
    }
    return { success: true };
  });

  ipcMain.handle('local-vms:open-console', async (_, vmName: string) => {
    const state = await getVmState(vmName);

    if (state !== 'running') {
      // Start the VM with GUI — this opens the console window
      await vboxManage(`startvm "${vmName}" --type gui`);
    } else {
      // VM is running — open VirtualBox GUI to show it
      spawn('VirtualBox', ['--startvm', vmName], {
        detached: true,
        stdio: 'ignore'
      }).unref();
    }

    return { success: true };
  });

  ipcMain.handle('local-vms:delete', async (_, vmName: string) => {
    const state = await getVmState(vmName);
    if (state === 'running') {
      await vboxManage(`controlvm "${vmName}" poweroff`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await vboxManage(`unregistervm "${vmName}" --delete`);
    return { success: true };
  });

  ipcMain.handle('local-vms:get-state', async (_, vmName: string) => {
    const registered = await getRegisteredVms();
    if (!registered.has(vmName)) return 'available';
    return await getVmState(vmName);
  });

  ipcMain.handle('local-vms:reload-config', async () => {
    const config = await loadConfig();
    return { success: true, config };
  });
}
