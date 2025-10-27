import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain } from 'electron';
import * as yaml from 'yaml';

const execAsync = promisify(exec);
// In development, the config is relative to the project root
// In production, it would be in the app resources
const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/vms.yaml')
  : path.join(app.getAppPath(), 'config/vms.yaml');

interface VMConfig {
  name: string;
  displayName: string;
  description: string;
  category: string;
  imagePath: string;
  specs: {
    memory: number; // MB
    cpus: number;
    diskSize: number; // GB
  };
  features: string[];
  os: {
    type: string;
    distribution: string;
    version: string;
  };
  network: {
    type: string;
    interface: string;
  };
  graphics: {
    type: string;
    port: number;
  };
  tags: string[];
  autoStart: boolean;
}

interface VMsConfig {
  vms: VMConfig[];
  settings: {
    defaultMemory: number;
    defaultCPUs: number;
    defaultNetwork: string;
    imagesDirectory: string;
    autoRefresh: boolean;
    refreshInterval: number;
  };
}

interface VM {
  name: string;
  displayName?: string;
  description?: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
  category?: string;
  tags?: string[];
}

async function loadVMConfig (): Promise<VMsConfig> {
  try {
    const fileContents = await fs.promises.readFile(CONFIG_PATH, 'utf8');
    return yaml.parse(fileContents) as VMsConfig;
  } catch (error) {
    console.error('Failed to load VM configuration:', error);
    // Return empty config if file doesn't exist or can't be parsed
    return {
      vms: [],
      settings: {
        defaultMemory: 2048,
        defaultCPUs: 2,
        defaultNetwork: 'nat',
        imagesDirectory: '/var/lib/libvirt/images',
        autoRefresh: true,
        refreshInterval: 5000
      }
    };
  }
}

async function executeVirshCommand (command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`virsh ${command}`);
    return stdout.trim();
  } catch (error) {
    console.error(`Virsh command failed: ${command}`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to execute virsh command: ${errorMessage}`);
  }
}

async function getVMState (domain: string): Promise<'running' | 'stopped' | 'paused'> {
  try {
    const dominfo = await executeVirshCommand(`dominfo ${domain}`);
    const lines = dominfo.split('\n');

    for (const line of lines) {
      if (line.includes('State:')) {
        const stateStr = line.split(':')[1].trim().toLowerCase();
        if (stateStr.includes('running')) return 'running';
        if (stateStr.includes('paused')) return 'paused';
        return 'stopped';
      }
    }
    return 'stopped';
  } catch (_error) {
    // If virsh fails, assume VM is stopped
    return 'stopped';
  }
}

async function checkImageExists (imagePath: string): Promise<boolean> {
  try {
    await fs.promises.access(imagePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getDiskSize (imagePath: string): Promise<string> {
  try {
    const stats = await fs.promises.stat(imagePath);
    const sizeInGB = (stats.size / (1024 * 1024 * 1024)).toFixed(1);
    return `${sizeInGB} GB`;
  } catch (_error) {
    return '0 GB';
  }
}

export function setupLibvirtIPC (): void {
  ipcMain.handle('libvirt:list-vms', async () => {
    try {
      const config = await loadVMConfig();
      const vms: VM[] = [];

      // Process each VM from the config
      for (const vmConfig of config.vms) {
        // Check the actual state using virsh
        const state = await getVMState(vmConfig.name);

        // Check if image exists and get actual size if it does
        const imageExists = await checkImageExists(vmConfig.imagePath);
        const actualDiskSize = imageExists
          ? await getDiskSize(vmConfig.imagePath)
          : `${vmConfig.specs.diskSize} GB (configured)`;

        const vm: VM = {
          name: vmConfig.name,
          displayName: vmConfig.displayName,
          description: vmConfig.description,
          state,
          memory: `${vmConfig.specs.memory} MB`,
          cpus: vmConfig.specs.cpus,
          diskSize: actualDiskSize,
          imagePath: vmConfig.imagePath,
          category: vmConfig.category,
          tags: vmConfig.tags
        };

        vms.push(vm);
      }

      return vms;
    } catch (error) {
      console.error('Failed to list VMs:', error);
      return [];
    }
  });

  ipcMain.handle('libvirt:start-vm', async (_, vmName: string) => {
    try {
      const config = await loadVMConfig();
      const vmConfig = config.vms.find((vm) => vm.name === vmName);

      if (!vmConfig) {
        throw new Error(`VM configuration not found for: ${vmName}`);
      }

      // Try to start the VM if it's already defined
      try {
        await executeVirshCommand(`start ${vmName}`);
        return { success: true };
      } catch {
        // If VM is not defined, try to define it first
        const imageExists = await checkImageExists(vmConfig.imagePath);
        if (!imageExists) {
          throw new Error(`VM image does not exist: ${vmConfig.imagePath}`);
        }

        // Create XML configuration from YAML config
        const xmlConfig = `
<domain type='kvm'>
  <name>${vmConfig.name}</name>
  <description>${vmConfig.description}</description>
  <memory unit='MiB'>${vmConfig.specs.memory}</memory>
  <vcpu placement='static'>${vmConfig.specs.cpus}</vcpu>
  <os>
    <type arch='x86_64' machine='pc-q35-6.2'>hvm</type>
    <boot dev='hd'/>
  </os>
  <features>
    <acpi/>
    <apic/>
  </features>
  <devices>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='${vmConfig.imagePath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <source network='${vmConfig.network.interface}'/>
      <model type='virtio'/>
    </interface>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <graphics type='${vmConfig.graphics.type}' port='${vmConfig.graphics.port}' autoport='yes' listen='127.0.0.1'/>
    <video>
      <model type='qxl' ram='65536' vram='65536' vgamem='16384' heads='1' primary='yes'/>
    </video>
  </devices>
</domain>`;

        const tempXmlPath = `/tmp/${vmName}.xml`;
        await fs.promises.writeFile(tempXmlPath, xmlConfig);
        await executeVirshCommand(`define ${tempXmlPath}`);
        await executeVirshCommand(`start ${vmName}`);
        await fs.promises.unlink(tempXmlPath);

        return { success: true };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start VM: ${errorMessage}`);
    }
  });

  ipcMain.handle('libvirt:stop-vm', async (_, vmName: string) => {
    try {
      await executeVirshCommand(`destroy ${vmName}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to stop VM: ${errorMessage}`);
    }
  });

  ipcMain.handle('libvirt:restart-vm', async (_, vmName: string) => {
    try {
      await executeVirshCommand(`reboot ${vmName}`);
      return { success: true };
    } catch (_error) {
      try {
        await executeVirshCommand(`destroy ${vmName}`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await executeVirshCommand(`start ${vmName}`);
        return { success: true };
      } catch (restartError) {
        const errorMessage = restartError instanceof Error ? restartError.message : String(restartError);
        throw new Error(`Failed to restart VM: ${errorMessage}`);
      }
    }
  });

  ipcMain.handle('libvirt:manage-vm', async (_, vmName: string) => {
    try {
      spawn('virt-manager', ['--show-domain-console', vmName], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open virt-manager: ${errorMessage}`);
    }
  });

  ipcMain.handle('libvirt:connect-vm', async (_, vmName: string) => {
    try {
      spawn('virt-viewer', [
        '-c',
        'qemu:///system',
        vmName
      ], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return { success: true };
    } catch (_error) {
      try {
        spawn('remote-viewer', ['spice://localhost:5900'], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        return { success: true };
      } catch (viewerError) {
        const errorMessage = viewerError instanceof Error ? viewerError.message : String(viewerError);
        throw new Error(`Failed to connect to VM: ${errorMessage}`);
      }
    }
  });

  ipcMain.handle('libvirt:create-vm', async () => {
    try {
      spawn('virt-manager', [], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open virt-manager: ${errorMessage}`);
    }
  });

  ipcMain.handle('libvirt:reload-config', async () => {
    try {
      const config = await loadVMConfig();
      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to reload configuration: ${errorMessage}`);
    }
  });
}
