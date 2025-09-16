import { ipcMain, shell } from 'electron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
const LIBVIRT_IMAGES_DIR = '/var/lib/libvirt/images';

interface VM {
  name: string;
  state: 'running' | 'stopped' | 'paused';
  memory: string;
  cpus: number;
  diskSize: string;
  imagePath: string;
}

async function executeVirshCommand(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`virsh ${command}`);
    return stdout.trim();
  } catch (error: any) {
    console.error(`Virsh command failed: ${command}`, error);
    throw new Error(`Failed to execute virsh command: ${error.message}`);
  }
}

async function getVMInfo(domain: string): Promise<Partial<VM>> {
  try {
    const dominfo = await executeVirshCommand(`dominfo ${domain}`);
    const lines = dominfo.split('\n');

    let state: 'running' | 'stopped' | 'paused' = 'stopped';
    let memory = '0 MB';
    let cpus = 0;

    for (const line of lines) {
      if (line.includes('State:')) {
        const stateStr = line.split(':')[1].trim().toLowerCase();
        if (stateStr.includes('running')) state = 'running';
        else if (stateStr.includes('paused')) state = 'paused';
        else state = 'stopped';
      } else if (line.includes('Max memory:')) {
        const memKB = parseInt(line.match(/\d+/)?.[0] || '0');
        memory = `${Math.round(memKB / 1024)} MB`;
      } else if (line.includes('CPU(s):')) {
        cpus = parseInt(line.match(/\d+/)?.[0] || '0');
      }
    }

    return { state, memory, cpus };
  } catch (error) {
    console.error(`Failed to get VM info for ${domain}:`, error);
    return { state: 'stopped', memory: '0 MB', cpus: 0 };
  }
}

async function getDiskSize(imagePath: string): Promise<string> {
  try {
    const stats = await fs.promises.stat(imagePath);
    const sizeInGB = (stats.size / (1024 * 1024 * 1024)).toFixed(1);
    return `${sizeInGB} GB`;
  } catch (error) {
    return '0 GB';
  }
}

async function scanForQcow2Images(): Promise<string[]> {
  try {
    const files = await fs.promises.readdir(LIBVIRT_IMAGES_DIR);
    return files.filter(file => file.endsWith('.qcow2'));
  } catch (error) {
    console.error('Failed to scan for qcow2 images:', error);
    return [];
  }
}

async function getVMFromImage(imagePath: string): Promise<VM | null> {
  const imageName = path.basename(imagePath, '.qcow2');

  try {
    const vmInfo = await getVMInfo(imageName);
    const diskSize = await getDiskSize(path.join(LIBVIRT_IMAGES_DIR, imagePath));

    return {
      name: imageName,
      state: vmInfo.state || 'stopped',
      memory: vmInfo.memory || '2048 MB',
      cpus: vmInfo.cpus || 2,
      diskSize,
      imagePath: imagePath
    };
  } catch (error) {
    return {
      name: imageName,
      state: 'stopped',
      memory: '2048 MB',
      cpus: 2,
      diskSize: await getDiskSize(path.join(LIBVIRT_IMAGES_DIR, imagePath)),
      imagePath: imagePath
    };
  }
}

export function setupLibvirtIPC(): void {
  ipcMain.handle('libvirt:list-vms', async () => {
    try {
      const qcow2Images = await scanForQcow2Images();
      const vms: VM[] = [];

      for (const image of qcow2Images) {
        const vm = await getVMFromImage(image);
        if (vm) vms.push(vm);
      }

      try {
        const listOutput = await executeVirshCommand('list --all --name');
        const domains = listOutput.split('\n').filter(d => d.trim());

        for (const domain of domains) {
          if (!domain) continue;

          const existingVM = vms.find(vm => vm.name === domain);
          if (existingVM) {
            const vmInfo = await getVMInfo(domain);
            existingVM.state = vmInfo.state || existingVM.state;
            existingVM.memory = vmInfo.memory || existingVM.memory;
            existingVM.cpus = vmInfo.cpus || existingVM.cpus;
          } else {
            const vmInfo = await getVMInfo(domain);
            vms.push({
              name: domain,
              state: vmInfo.state || 'stopped',
              memory: vmInfo.memory || '2048 MB',
              cpus: vmInfo.cpus || 2,
              diskSize: 'Unknown',
              imagePath: `${domain}.qcow2`
            });
          }
        }
      } catch (error) {
        console.log('Virsh not available or no domains found, showing qcow2 files only');
      }

      return vms;
    } catch (error) {
      console.error('Failed to list VMs:', error);
      return [];
    }
  });

  ipcMain.handle('libvirt:start-vm', async (_, vmName: string) => {
    try {
      await executeVirshCommand(`start ${vmName}`);
      return { success: true };
    } catch (error: any) {
      const imagePath = path.join(LIBVIRT_IMAGES_DIR, `${vmName}.qcow2`);
      if (fs.existsSync(imagePath)) {
        try {
          const xmlConfig = `
<domain type='kvm'>
  <name>${vmName}</name>
  <memory unit='KiB'>2097152</memory>
  <vcpu placement='static'>2</vcpu>
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
      <source file='${imagePath}'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>
    <console type='pty'>
      <target type='serial' port='0'/>
    </console>
    <graphics type='vnc' port='-1' autoport='yes' listen='127.0.0.1'/>
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
        } catch (defineError) {
          console.error('Failed to define and start VM:', defineError);
          throw new Error(`Failed to start VM: ${defineError}`);
        }
      }
      throw new Error(`Failed to start VM: ${error.message}`);
    }
  });

  ipcMain.handle('libvirt:stop-vm', async (_, vmName: string) => {
    try {
      await executeVirshCommand(`destroy ${vmName}`);
      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to stop VM: ${error.message}`);
    }
  });

  ipcMain.handle('libvirt:restart-vm', async (_, vmName: string) => {
    try {
      await executeVirshCommand(`reboot ${vmName}`);
      return { success: true };
    } catch (error: any) {
      try {
        await executeVirshCommand(`destroy ${vmName}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await executeVirshCommand(`start ${vmName}`);
        return { success: true };
      } catch (restartError: any) {
        throw new Error(`Failed to restart VM: ${restartError.message}`);
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
    } catch (error: any) {
      throw new Error(`Failed to open virt-manager: ${error.message}`);
    }
  });

  ipcMain.handle('libvirt:connect-vm', async (_, vmName: string) => {
    try {
      spawn('virt-viewer', ['-c', 'qemu:///system', vmName], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      return { success: true };
    } catch (error: any) {
      try {
        spawn('remote-viewer', [`spice://localhost:5900`], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        return { success: true };
      } catch (viewerError: any) {
        throw new Error(`Failed to connect to VM: ${viewerError.message}`);
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
    } catch (error: any) {
      throw new Error(`Failed to open virt-manager: ${error.message}`);
    }
  });
}