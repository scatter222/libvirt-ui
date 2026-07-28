import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import { app, ipcMain, shell } from 'electron';
import * as yaml from 'yaml';

const execFileAsync = promisify(execFile);

const CONFIG_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'config/local-vms.yaml')
  : path.join(app.getAppPath(), 'config/local-vms.yaml');

// Mount name inside the guest (VirtualBox automounts it as e.g. /media/sf_shared)
const SHARED_FOLDER_NAME = 'shared';

// Importing an OVA can legitimately take several minutes
const IMPORT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

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
    sharedFoldersDirectory?: string;
    autoRefresh: boolean;
    refreshInterval: number;
  };
  vms: LocalVmTemplate[];
}

export type LocalVmState = 'running' | 'stopped' | 'paused' | 'suspended';

export interface LocalTemplateInfo {
  name: string;
  displayName: string;
  description: string;
  category: string;
  memory: number;
  cpus: number;
  tags: string[];
  ovaPath: string;
  ovaExists: boolean;
  instanceCount: number;
}

export interface LocalVmInstance {
  name: string;
  templateName: string;
  displayName: string;
  description: string;
  category: string;
  state: LocalVmState;
  memory: number;
  cpus: number;
  tags: string[];
  sharedFolderPath: string;
  sharedFolderAttached: boolean;
}

export interface DeployProgress {
  templateName: string;
  instanceName: string;
  phase: 'preparing' | 'importing' | 'configuring' | 'shared-folder' | 'starting' | 'done' | 'error';
  message: string;
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

function expandHome (p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function sharedFoldersRoot (config: LocalVmsConfig): string {
  return expandHome(config.settings.sharedFoldersDirectory || '~/vm-shared');
}

function sharedFolderPathFor (config: LocalVmsConfig, instanceName: string): string {
  return path.join(sharedFoldersRoot(config), os.userInfo().username, instanceName);
}

// VM names we generate or accept must be shell-safe and filesystem-safe
function isSafeName (name: string): boolean {
  return (/^[A-Za-z0-9][A-Za-z0-9._-]*$/).test(name);
}

function assertSafeName (name: string): void {
  if (!isSafeName(name)) {
    throw new Error(`Invalid VM name: ${name}`);
  }
}

async function vboxManage (args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  try {
    const { stdout } = await execFileAsync('VBoxManage', args, {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024
    });
    return stdout.trim();
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    const detail = err.stderr?.trim() || err.message || String(error);
    throw new Error(`VBoxManage ${args[0]} failed: ${detail}`);
  }
}

async function getRegisteredVms (): Promise<Set<string>> {
  try {
    const output = await vboxManage(['list', 'vms']);
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

interface VmInfo {
  state: LocalVmState;
  memory?: number;
  cpus?: number;
  sharedFolders: Map<string, string>;
}

function parseVmState (raw: string | undefined): LocalVmState {
  if (raw === 'running') return 'running';
  if (raw === 'paused') return 'paused';
  if (raw === 'saved') return 'suspended';
  return 'stopped';
}

async function getVmInfo (vmName: string): Promise<VmInfo> {
  const info: VmInfo = { state: 'stopped', sharedFolders: new Map() };
  try {
    const output = await vboxManage([
      'showvminfo',
      vmName,
      '--machinereadable'
    ]);

    const stateMatch = output.match(/^VMState="(.+?)"$/m);
    info.state = parseVmState(stateMatch?.[1]);

    const memMatch = output.match(/^memory=(\d+)$/m);
    if (memMatch) info.memory = parseInt(memMatch[1], 10);

    const cpuMatch = output.match(/^cpus=(\d+)$/m);
    if (cpuMatch) info.cpus = parseInt(cpuMatch[1], 10);

    // SharedFolderNameMachineMapping1="shared" / SharedFolderPathMachineMapping1="/path"
    const nameRe = /^SharedFolderNameMachineMapping(\d+)="(.+?)"$/gm;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(output)) !== null) {
      const idx = m[1];
      const pathMatch = output.match(new RegExp(`^SharedFolderPathMachineMapping${idx}="(.+?)"$`, 'm'));
      info.sharedFolders.set(m[2], pathMatch?.[1] ?? '');
    }
  } catch (_error) {
    // Missing/unreadable VM reads as stopped with no shared folders
  }
  return info;
}

async function getVmState (vmName: string): Promise<LocalVmState> {
  return (await getVmInfo(vmName)).state;
}

/**
 * Instances of a template are registered VirtualBox VMs named exactly like the
 * template, or "<template>-N". This is also how manually deployed VMs get
 * adopted: a VM someone imported by hand under a matching name shows up and is
 * managed exactly as if this app had deployed it.
 */
function instancesOfTemplate (templateName: string, registered: Set<string>): string[] {
  const re = new RegExp(`^${templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?$`);
  return [...registered]
    .filter((name) => re.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nextInstanceName (templateName: string, registered: Set<string>): string {
  if (!registered.has(templateName)) return templateName;
  for (let n = 2; ; n++) {
    const candidate = `${templateName}-${n}`;
    if (!registered.has(candidate)) return candidate;
  }
}

function instanceDisplayName (template: LocalVmTemplate, instanceName: string): string {
  const suffix = instanceName.slice(template.name.length);
  const match = suffix.match(/^-(\d+)$/);
  return match ? `${template.displayName} #${match[1]}` : template.displayName;
}

async function fileExists (p: string): Promise<boolean> {
  try {
    await fs.promises.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Make sure the per-user host directory exists and is attached to the VM as
 * an automounted shared folder. Safe to call repeatedly; only attaches while
 * the VM is powered off, so adopted VMs pick their folder up on next start.
 */
async function ensureSharedFolder (config: LocalVmsConfig, instanceName: string, info?: VmInfo): Promise<void> {
  const hostPath = sharedFolderPathFor(config, instanceName);
  await fs.promises.mkdir(hostPath, { recursive: true });

  const vmInfo = info ?? await getVmInfo(instanceName);
  if (vmInfo.sharedFolders.has(SHARED_FOLDER_NAME)) return;
  if (vmInfo.state === 'running' || vmInfo.state === 'paused') return;

  await vboxManage([
    'sharedfolder',
    'add',
    instanceName,
    '--name',
    SHARED_FOLDER_NAME,
    '--hostpath',
    hostPath,
    '--automount'
  ]);
}

// Prevent concurrent VBoxManage operations on the same VM (double clicks,
// refresh racing a deploy, etc.). Operations on different VMs still run in
// parallel.
const vmLocks = new Map<string, Promise<unknown>>();

function withVmLock<T> (vmName: string, fn: () => Promise<T>): Promise<T> {
  const prev = vmLocks.get(vmName) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  vmLocks.set(vmName, next);
  next.finally(() => {
    if (vmLocks.get(vmName) === next) vmLocks.delete(vmName);
  }).catch(() => {});
  return next;
}

export function setupLocalVmIPC (): void {
  ipcMain.handle('local-vms:list', async () => {
    try {
      const config = await loadConfig();
      const registered = await getRegisteredVms();

      const templates: LocalTemplateInfo[] = [];
      const instances: LocalVmInstance[] = [];

      for (const tpl of config.vms) {
        const ovaPath = path.join(config.settings.imagesDirectory, tpl.ovaFile);
        const instanceNames = instancesOfTemplate(tpl.name, registered);

        templates.push({
          name: tpl.name,
          displayName: tpl.displayName,
          description: tpl.description,
          category: tpl.category,
          memory: tpl.specs.memory,
          cpus: tpl.specs.cpus,
          tags: tpl.tags,
          ovaPath,
          ovaExists: await fileExists(ovaPath),
          instanceCount: instanceNames.length
        });

        const infos = await Promise.all(instanceNames.map((name) => getVmInfo(name)));
        instanceNames.forEach((name, i) => {
          const info = infos[i];
          instances.push({
            name,
            templateName: tpl.name,
            displayName: instanceDisplayName(tpl, name),
            description: tpl.description,
            category: tpl.category,
            state: info.state,
            memory: info.memory ?? tpl.specs.memory,
            cpus: info.cpus ?? tpl.specs.cpus,
            tags: tpl.tags,
            sharedFolderPath: sharedFolderPathFor(config, name),
            sharedFolderAttached: info.sharedFolders.has(SHARED_FOLDER_NAME)
          });
        });
      }

      return { templates, instances };
    } catch (_error) {
      console.error('Failed to list local VMs:', _error);
      return { templates: [], instances: [] };
    }
  });

  ipcMain.handle('local-vms:deploy', async (event, templateName: string) => {
    assertSafeName(templateName);
    const config = await loadConfig();
    const tpl = config.vms.find((v) => v.name === templateName);
    if (!tpl) throw new Error(`VM template not found in config: ${templateName}`);

    const registered = await getRegisteredVms();
    const instanceName = nextInstanceName(tpl.name, registered);
    assertSafeName(instanceName);

    const progress = (phase: DeployProgress['phase'], message: string) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('local-vms:progress', {
          templateName: tpl.name, instanceName, phase, message
        } satisfies DeployProgress);
      }
    };

    return withVmLock(instanceName, async () => {
      try {
        progress('preparing', 'Checking image...');
        const ovaPath = path.join(config.settings.imagesDirectory, tpl.ovaFile);
        if (!await fileExists(ovaPath)) {
          throw new Error(`OVA file not found: ${ovaPath}`);
        }

        progress('importing', 'Importing OVA image (this can take a few minutes)...');
        await vboxManage([
          'import',
          ovaPath,
          '--vsys',
          '0',
          '--vmname',
          instanceName
        ], IMPORT_TIMEOUT_MS);

        progress('configuring', `Applying specs (${tpl.specs.memory} MB RAM, ${tpl.specs.cpus} CPUs)...`);
        await vboxManage([
          'modifyvm',
          instanceName,
          '--memory',
          String(tpl.specs.memory),
          '--cpus',
          String(tpl.specs.cpus)
        ]);

        // Attach boot ISO if configured (e.g. live distro ISOs)
        if (tpl.isoFile) {
          const isoPath = path.join(config.settings.imagesDirectory, tpl.isoFile);
          if (await fileExists(isoPath)) {
            await vboxManage([
              'storagectl',
              instanceName,
              '--name',
              'IDE',
              '--add',
              'ide'
            ]).catch(() => {});
            await vboxManage([
              'storageattach',
              instanceName,
              '--storagectl',
              'IDE',
              '--port',
              '0',
              '--device',
              '0',
              '--type',
              'dvddrive',
              '--medium',
              isoPath
            ]);
            await vboxManage([
              'modifyvm',
              instanceName,
              '--boot1',
              'dvd',
              '--boot2',
              'disk'
            ]);
          } else {
            console.warn(`ISO file not found, skipping: ${isoPath}`);
          }
        }

        progress('shared-folder', 'Setting up shared folder...');
        await ensureSharedFolder(config, instanceName);

        progress('starting', 'Starting VM...');
        await vboxManage([
          'startvm',
          instanceName,
          '--type',
          'gui'
        ]);

        progress('done', 'VM is up.');
        return { success: true, instanceName };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        progress('error', message);
        throw new Error(message);
      }
    });
  });

  ipcMain.handle('local-vms:start', async (_, vmName: string) => {
    assertSafeName(vmName);
    return withVmLock(vmName, async () => {
      const registered = await getRegisteredVms();
      if (!registered.has(vmName)) {
        throw new Error(`VM is not deployed: ${vmName}`);
      }

      // Adopted VMs get their shared folder attached here on first start
      const config = await loadConfig();
      await ensureSharedFolder(config, vmName).catch((err) => {
        console.warn(`Could not ensure shared folder for ${vmName}:`, err);
      });

      await vboxManage([
        'startvm',
        vmName,
        '--type',
        'gui'
      ]);
      return { success: true };
    });
  });

  ipcMain.handle('local-vms:stop', async (_, vmName: string, force?: boolean) => {
    assertSafeName(vmName);
    return withVmLock(vmName, async () => {
      const state = await getVmState(vmName);
      if (state !== 'running' && state !== 'paused') {
        return { success: true };
      }
      if (force) {
        await vboxManage([
          'controlvm',
          vmName,
          'poweroff'
        ]);
      } else {
        await vboxManage([
          'controlvm',
          vmName,
          'acpipowerbutton'
        ]);
      }
      return { success: true };
    });
  });

  ipcMain.handle('local-vms:restart', async (_, vmName: string) => {
    assertSafeName(vmName);
    return withVmLock(vmName, async () => {
      const state = await getVmState(vmName);
      if (state !== 'running' && state !== 'paused') {
        await vboxManage([
          'startvm',
          vmName,
          '--type',
          'gui'
        ]);
        return { success: true };
      }
      try {
        await vboxManage([
          'controlvm',
          vmName,
          'reset'
        ]);
      } catch (_error) {
        await vboxManage([
          'controlvm',
          vmName,
          'poweroff'
        ]);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await vboxManage([
          'startvm',
          vmName,
          '--type',
          'gui'
        ]);
      }
      return { success: true };
    });
  });

  ipcMain.handle('local-vms:open-console', async (_, vmName: string) => {
    assertSafeName(vmName);
    const state = await getVmState(vmName);

    if (state !== 'running') {
      // Start the VM with GUI — this opens the console window
      await withVmLock(vmName, () => vboxManage([
        'startvm',
        vmName,
        '--type',
        'gui'
      ]));
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
    assertSafeName(vmName);
    return withVmLock(vmName, async () => {
      const state = await getVmState(vmName);
      if (state === 'running' || state === 'paused') {
        await vboxManage([
          'controlvm',
          vmName,
          'poweroff'
        ]);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      await vboxManage([
        'unregistervm',
        vmName,
        '--delete'
      ]);
      // The host shared folder directory is intentionally kept — it may hold
      // evidence/artifacts the user still needs.
      return { success: true };
    });
  });

  ipcMain.handle('local-vms:open-shared-folder', async (_, vmName: string) => {
    assertSafeName(vmName);
    const config = await loadConfig();
    const hostPath = sharedFolderPathFor(config, vmName);
    await fs.promises.mkdir(hostPath, { recursive: true });
    const result = await shell.openPath(hostPath);
    if (result) throw new Error(result);
    return { success: true, path: hostPath };
  });

  ipcMain.handle('local-vms:get-state', async (_, vmName: string) => {
    assertSafeName(vmName);
    const registered = await getRegisteredVms();
    if (!registered.has(vmName)) return 'available';
    return await getVmState(vmName);
  });

  ipcMain.handle('local-vms:reload-config', async () => {
    const config = await loadConfig();
    return { success: true, config };
  });
}
