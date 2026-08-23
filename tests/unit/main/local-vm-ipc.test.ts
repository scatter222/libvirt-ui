import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain, shell } from '../../mocks/electron';

// VBoxManage stand-in: routes each invocation by subcommand and records every
// call, so tests control VirtualBox state and assert the commands issued.
const cp = vi.hoisted(() => {
  type Router = (args: string[]) => string | Error;
  const state = {
    calls: [] as string[][],
    spawns: [] as string[][],
    routes: new Map<string, Router>()
  };

  return {
    state,
    execFile (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, result?: { stdout: string; stderr: string }) => void) {
      state.calls.push([cmd, ...args]);
      queueMicrotask(() => {
        const route = state.routes.get(args[0]);
        const result = route ? route(args) : '';
        if (result instanceof Error) cb(result);
        else cb(null, { stdout: result, stderr: '' });
      });
    },
    spawn (cmd: string, args: string[]) {
      state.spawns.push([cmd, ...args]);
      return { unref: () => {} };
    }
  };
});

vi.mock('child_process', () => ({ execFile: cp.execFile, spawn: cp.spawn }));

// Route helpers -------------------------------------------------------------

const route = (sub: string, fn: (args: string[]) => string | Error) => cp.state.routes.set(sub, fn);

const listVms = (...names: string[]) => {
  route('list', () => names.map((n) => `"${n}" {${n}-uuid}`).join('\n'));
};

interface FakeVm {
  state?: string;
  memory?: number;
  cpus?: number;
  shared?: Record<string, string>;
  extradata?: Record<string, string>;
  guestAdditions?: boolean;
}

const showVmInfo = (vms: Record<string, FakeVm>) => {
  route('showvminfo', (args) => {
    const vm = vms[args[1]];
    if (!vm) return new Error(`Could not find a registered machine named '${args[1]}'`);
    const lines = [`VMState="${vm.state ?? 'poweroff'}"`];
    if (vm.memory) lines.push(`memory=${vm.memory}`);
    if (vm.cpus) lines.push(`cpus=${vm.cpus}`);
    Object.entries(vm.shared ?? {}).forEach(([name, hostPath], i) => {
      lines.push(`SharedFolderNameMachineMapping${i + 1}="${name}"`);
      lines.push(`SharedFolderPathMachineMapping${i + 1}="${hostPath}"`);
    });
    return lines.join('\n');
  });
  route('getextradata', (args) => {
    const vm = vms[args[1]];
    return Object.entries(vm?.extradata ?? {})
      .map(([k, v]) => `Key: ${k}, Value: ${v}`)
      .join('\n');
  });
  route('guestproperty', (args) => (vms[args[2]]?.guestAdditions
    ? 'Value: 7.0.18'
    : new Error('No value set!')));
};

const commandsIssued = (sub?: string) => cp.state.calls
  .filter((c) => c[0] === 'VBoxManage' && (!sub || c[1] === sub))
  .map((c) => c.slice(1));

// Fixture -------------------------------------------------------------------

let tmpDir: string;
let imagesDir: string;
let sharedRoot: string;
const username = os.userInfo().username;

const CONFIG = () => `
settings:
  imagesDirectory: ${imagesDir}
  machinesDirectory: ${path.join(tmpDir, 'machines')}
  sharedFoldersDirectory: ${sharedRoot}
  autoRefresh: true
  refreshInterval: 5000
vms:
  - name: kali
    displayName: Kali Linux
    description: Pentest distro
    category: offensive
    ovaFile: kali.ova
    maxInstances: 2
    specs:
      memory: 2048
      cpus: 2
    tags: [linux, offensive]
  - name: flare
    displayName: FLARE-VM
    description: Windows RE
    category: forensics
    ovaFile: flare.ova
    specs:
      memory: 4096
      cpus: 4
    tags: [windows]
`;

describe('localVmIPC', () => {
  beforeAll(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'local-vm-ipc-'));
    imagesDir = path.join(tmpDir, 'images');
    sharedRoot = path.join(tmpDir, 'shared');
    await fs.promises.mkdir(path.join(tmpDir, 'config'), { recursive: true });
    await fs.promises.mkdir(imagesDir, { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, 'config/local-vms.yaml'), CONFIG());
    // Only kali.ova exists; the flare template's image is missing
    await fs.promises.writeFile(path.join(imagesDir, 'kali.ova'), 'fake-ova');

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/localVmIPC');
    mod.setupLocalVmIPC();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    cp.state.calls.length = 0;
    cp.state.spawns.length = 0;
    cp.state.routes.clear();
    listVms();
    showVmInfo({});
    // Fresh shared-folder tree per test — leftover content changes allocation
    // (a non-empty folder is never reused; a ".N" suffix is allocated instead)
    await fs.promises.rm(sharedRoot, { recursive: true, force: true });
  });

  describe('local-vms:list', () => {
    it('builds the template/instance/host model from config and VirtualBox state', async () => {
      const attachedShared = path.join(sharedRoot, username, 'kali');
      await fs.promises.mkdir(attachedShared, { recursive: true });
      await fs.promises.writeFile(path.join(attachedShared, 'loot.txt'), 'x');
      await fs.promises.writeFile(path.join(attachedShared, 'notes.md'), 'y');

      listVms('kali', 'kali-2', 'unrelated-vm');
      showVmInfo({
        kali: {
          state: 'running',
          memory: 3072,
          cpus: 3,
          shared: { shared: attachedShared },
          extradata: { 'launcher/label': 'Case 4211', 'launcher/notes': 'phishing payload' },
          guestAdditions: true
        },
        'kali-2': { state: 'saved', memory: 2048, cpus: 2 },
        'unrelated-vm': { state: 'running', memory: 9999, cpus: 9 }
      });

      const result = await ipcMain.invoke('local-vms:list') as {
        templates: Array<Record<string, unknown>>;
        instances: Array<Record<string, unknown>>;
        host: Record<string, number>;
      };

      // Templates reflect config + on-disk OVA presence + live instance counts
      expect(result.templates).toHaveLength(2);
      const [kaliTpl, flareTpl] = result.templates;
      expect(kaliTpl).toMatchObject({
        name: 'kali',
        displayName: 'Kali Linux',
        memory: 2048,
        cpus: 2,
        ovaExists: true,
        instanceCount: 2,
        maxInstances: 2
      });
      expect(flareTpl).toMatchObject({
        name: 'flare',
        ovaExists: false,
        instanceCount: 0,
        // no maxInstances in config → unlimited
        maxInstances: null
      });

      // Instances: adopted by name match; unrelated-vm is not picked up
      expect(result.instances.map((i) => i.name)).toEqual(['kali', 'kali-2']);
      const [kali, kali2] = result.instances;
      expect(kali).toMatchObject({
        templateName: 'kali',
        displayName: 'Kali Linux',
        state: 'running',
        memory: 3072,
        cpus: 3,
        label: 'Case 4211',
        notes: 'phishing payload',
        sharedFolderPath: attachedShared,
        sharedFolderAttached: true,
        sharedFolderItemCount: 2,
        guestAdditionsActive: true
      });
      expect(kali2).toMatchObject({
        displayName: 'Kali Linux #2',
        // "saved" maps to suspended
        state: 'suspended',
        sharedFolderAttached: false,
        // not running → cannot tell
        guestAdditionsActive: null
      });

      // Host allocation counts only running/paused instances of managed templates
      expect(result.host).toMatchObject({
        allocatedMemMB: 3072,
        allocatedCpus: 3,
        runningCount: 1,
        cpuCount: os.cpus().length
      });
    });

    it('returns an empty model when VirtualBox is unavailable', async () => {
      route('list', () => new Error('VBoxManage: command not found'));

      const result = await ipcMain.invoke('local-vms:list') as { templates: unknown[]; instances: unknown[] };
      expect(result.templates).toHaveLength(2);
      expect(result.instances).toEqual([]);
    });
  });

  describe('local-vms:deploy', () => {
    const fakeSender = () => {
      const sent: Array<{ channel: string; payload: Record<string, unknown> }> = [];
      return {
        sent,
        event: {
          sender: {
            isDestroyed: () => false,
            send: (channel: string, payload: Record<string, unknown>) => sent.push({ channel, payload })
          }
        }
      };
    };

    it('imports the next free instance name, applies specs, and reports progress', async () => {
      listVms('kali');
      const { sent, event } = fakeSender();

      const result = await ipcMain.invoke('local-vms:deploy', event, 'kali', { memory: 1024, cpus: 1 });
      expect(result).toEqual({ success: true, instanceName: 'kali-2' });

      const importCmd = commandsIssued('import')[0];
      expect(importCmd).toEqual([
        'import',
        path.join(imagesDir, 'kali.ova'),
        '--vsys',
        '0',
        '--vmname',
        'kali-2',
        '--basefolder',
        path.join(tmpDir, 'machines', username)
      ]);
      expect(commandsIssued('modifyvm')[0]).toEqual([
        'modifyvm',
        'kali-2',
        '--memory',
        '1024',
        '--cpus',
        '1'
      ]);
      expect(commandsIssued('startvm')[0]).toEqual([
        'startvm',
        'kali-2',
        '--type',
        'gui'
      ]);

      // The shared folder directory really exists on disk and was attached
      const sharedPath = path.join(sharedRoot, username, 'kali-2');
      expect(fs.existsSync(sharedPath)).toBe(true);
      expect(commandsIssued('sharedfolder')[0]).toContain(sharedPath);

      // Progress narrated phase by phase to the requesting window
      expect(sent.every((s) => s.channel === 'local-vms:progress')).toBe(true);
      expect(sent.map((s) => s.payload.phase)).toEqual([
        'preparing',
        'importing',
        'configuring',
        'shared-folder',
        'starting',
        'done'
      ]);
      expect(sent[0].payload).toMatchObject({ templateName: 'kali', instanceName: 'kali-2' });
    });

    it('refuses to exceed the template instance limit', async () => {
      listVms('kali', 'kali-2');
      const { event } = fakeSender();

      await expect(ipcMain.invoke('local-vms:deploy', event, 'kali'))
        .rejects.toThrow('Instance limit reached for Kali Linux (2/2)');
      expect(commandsIssued('import')).toHaveLength(0);
    });

    it('rejects spec overrides outside host bounds before touching VirtualBox', async () => {
      const { event } = fakeSender();

      await expect(ipcMain.invoke('local-vms:deploy', event, 'kali', { memory: 100, cpus: 1 }))
        .rejects.toThrow(/Invalid memory 100 MB/);
      await expect(ipcMain.invoke('local-vms:deploy', event, 'kali', { memory: 1024, cpus: 0 }))
        .rejects.toThrow(/Invalid CPU count 0/);
      expect(commandsIssued('import')).toHaveLength(0);
    });

    it('fails with a progress error when the OVA image is missing', async () => {
      const { sent, event } = fakeSender();

      await expect(ipcMain.invoke('local-vms:deploy', event, 'flare'))
        .rejects.toThrow(/OVA file not found/);
      expect(sent.at(-1)?.payload.phase).toBe('error');
      expect(commandsIssued('import')).toHaveLength(0);
    });

    it('rejects shell-unsafe template names outright', async () => {
      const { event } = fakeSender();
      await expect(ipcMain.invoke('local-vms:deploy', event, 'kali; rm -rf /'))
        .rejects.toThrow('Invalid VM name: kali; rm -rf /');
      expect(cp.state.calls).toHaveLength(0);
    });
  });

  describe('lifecycle handlers', () => {
    it('refuses to start a VM that is not deployed', async () => {
      listVms('kali');
      await expect(ipcMain.invoke('local-vms:start', {}, 'ghost'))
        .rejects.toThrow('VM is not deployed: ghost');
      expect(commandsIssued('startvm')).toHaveLength(0);
    });

    it('starts a deployed VM and ensures its shared folder first', async () => {
      listVms('kali');
      showVmInfo({ kali: { state: 'poweroff' } });

      const result = await ipcMain.invoke('local-vms:start', {}, 'kali');
      expect(result).toEqual({ success: true });

      const sharedPath = path.join(sharedRoot, username, 'kali');
      expect(commandsIssued('sharedfolder')[0]).toEqual([
        'sharedfolder',
        'add',
        'kali',
        '--name',
        'shared',
        '--hostpath',
        sharedPath,
        '--automount'
      ]);
      expect(commandsIssued('startvm')[0]).toEqual([
        'startvm',
        'kali',
        '--type',
        'gui'
      ]);
    });

    it('stop is a no-op when the VM is already down', async () => {
      showVmInfo({ kali: { state: 'poweroff' } });

      const result = await ipcMain.invoke('local-vms:stop', {}, 'kali');
      expect(result).toEqual({ success: true });
      expect(commandsIssued('controlvm')).toHaveLength(0);
    });

    it('stop sends ACPI by default and hard powers off when forced', async () => {
      showVmInfo({ kali: { state: 'running' } });

      await ipcMain.invoke('local-vms:stop', {}, 'kali');
      expect(commandsIssued('controlvm')[0]).toEqual(['controlvm', 'kali', 'acpipowerbutton']);

      await ipcMain.invoke('local-vms:stop', {}, 'kali', true);
      expect(commandsIssued('controlvm')[1]).toEqual(['controlvm', 'kali', 'poweroff']);
    });

    it('restart starts a stopped VM instead of resetting it', async () => {
      showVmInfo({ kali: { state: 'poweroff' } });

      await ipcMain.invoke('local-vms:restart', {}, 'kali');
      expect(commandsIssued('controlvm')).toHaveLength(0);
      expect(commandsIssued('startvm')[0]).toEqual([
        'startvm',
        'kali',
        '--type',
        'gui'
      ]);
    });

    it('restart resets a running VM in place', async () => {
      showVmInfo({ kali: { state: 'running' } });

      await ipcMain.invoke('local-vms:restart', {}, 'kali');
      expect(commandsIssued('controlvm')[0]).toEqual(['controlvm', 'kali', 'reset']);
      expect(commandsIssued('startvm')).toHaveLength(0);
    });

    it('open-console starts a stopped VM but attaches the GUI to a running one', async () => {
      showVmInfo({ kali: { state: 'poweroff' } });
      await ipcMain.invoke('local-vms:open-console', {}, 'kali');
      expect(commandsIssued('startvm')).toHaveLength(1);
      expect(cp.state.spawns).toHaveLength(0);

      showVmInfo({ kali: { state: 'running' } });
      await ipcMain.invoke('local-vms:open-console', {}, 'kali');
      expect(cp.state.spawns).toEqual([['VirtualBox', '--startvm', 'kali']]);
    });

    it('reports state as available for undeployed names and the parsed state otherwise', async () => {
      listVms('kali');
      showVmInfo({ kali: { state: 'paused' } });

      expect(await ipcMain.invoke('local-vms:get-state', {}, 'ghost')).toBe('available');
      expect(await ipcMain.invoke('local-vms:get-state', {}, 'kali')).toBe('paused');
    });
  });

  describe('local-vms:set-specs', () => {
    it('refuses while the VM is running', async () => {
      showVmInfo({ kali: { state: 'running' } });

      await expect(ipcMain.invoke('local-vms:set-specs', {}, 'kali', { memory: 1024, cpus: 1 }))
        .rejects.toThrow('Stop the VM before changing its RAM or CPUs');
      expect(commandsIssued('modifyvm')).toHaveLength(0);
    });

    it('applies validated specs to a stopped VM', async () => {
      showVmInfo({ kali: { state: 'poweroff' } });

      const result = await ipcMain.invoke('local-vms:set-specs', {}, 'kali', { memory: 1536, cpus: 1 });
      expect(result).toEqual({ success: true });
      expect(commandsIssued('modifyvm')[0]).toEqual([
        'modifyvm',
        'kali',
        '--memory',
        '1536',
        '--cpus',
        '1'
      ]);
    });

    it('rejects non-integer or out-of-range specs', async () => {
      await expect(ipcMain.invoke('local-vms:set-specs', {}, 'kali', { memory: 1024.5, cpus: 1 }))
        .rejects.toThrow(/Invalid memory/);
    });
  });

  describe('local-vms:set-metadata', () => {
    it('flattens multi-line values and deletes keys for empty ones', async () => {
      await ipcMain.invoke('local-vms:set-metadata', {}, 'kali', {
        label: '  Case 4211\n  phishing  ',
        notes: ''
      });

      const setCalls = commandsIssued('setextradata');
      // Multi-line label is collapsed to one line (extradata is read back line-wise)
      expect(setCalls[0]).toEqual([
        'setextradata',
        'kali',
        'launcher/label',
        'Case 4211 phishing'
      ]);
      // Empty notes → no value argument, which deletes the key
      expect(setCalls[1]).toEqual([
        'setextradata',
        'kali',
        'launcher/notes'
      ]);
    });
  });

  describe('local-vms:delete', () => {
    it('unregisters a stopped VM and keeps shared data by default', async () => {
      const folder = path.join(sharedRoot, username, 'kali');
      await fs.promises.mkdir(folder, { recursive: true });
      await fs.promises.writeFile(path.join(folder, 'keep.txt'), 'data');
      showVmInfo({ kali: { state: 'poweroff', shared: { shared: folder } } });

      const result = await ipcMain.invoke('local-vms:delete', {}, 'kali');
      expect(result).toEqual({ success: true });
      expect(commandsIssued('controlvm')).toHaveLength(0);
      expect(commandsIssued('unregistervm')[0]).toEqual([
        'unregistervm',
        'kali',
        '--delete'
      ]);
      expect(fs.existsSync(path.join(folder, 'keep.txt'))).toBe(true);
    });

    it('deletes shared data only when opted in', async () => {
      const folder = path.join(sharedRoot, username, 'kali');
      await fs.promises.mkdir(folder, { recursive: true });
      await fs.promises.writeFile(path.join(folder, 'loot.txt'), 'data');
      showVmInfo({ kali: { state: 'poweroff', shared: { shared: folder } } });

      await ipcMain.invoke('local-vms:delete', {}, 'kali', true);
      expect(fs.existsSync(folder)).toBe(false);
    });

    it('never deletes folders outside the app-managed shared root', async () => {
      const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'precious-'));
      await fs.promises.writeFile(path.join(outside, 'do-not-touch.txt'), 'x');
      showVmInfo({ kali: { state: 'poweroff', shared: { shared: outside } } });

      await ipcMain.invoke('local-vms:delete', {}, 'kali', true);
      expect(fs.existsSync(path.join(outside, 'do-not-touch.txt'))).toBe(true);
    });
  });

  describe('shared folder handlers', () => {
    it('copies dropped files into the attached shared folder', async () => {
      const folder = path.join(sharedRoot, username, 'kali');
      await fs.promises.mkdir(folder, { recursive: true });
      showVmInfo({ kali: { state: 'running', shared: { shared: folder } } });

      const srcDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'drop-src-'));
      await fs.promises.writeFile(path.join(srcDir, 'sample.bin'), 'malware');
      await fs.promises.writeFile(path.join(srcDir, 'report.md'), 'notes');

      const result = await ipcMain.invoke('local-vms:copy-to-shared', {}, 'kali', [
        path.join(srcDir, 'sample.bin'),
        path.join(srcDir, 'does-not-exist.txt'),
        path.join(srcDir, 'report.md')
      ]);

      // Missing sources are skipped; real files land in the folder
      expect(result).toEqual({ success: true, copied: 2, folder });
      expect(await fs.promises.readFile(path.join(folder, 'sample.bin'), 'utf8')).toBe('malware');
      expect(await fs.promises.readFile(path.join(folder, 'report.md'), 'utf8')).toBe('notes');
    });

    it('fails when none of the dropped items exist', async () => {
      const folder = path.join(sharedRoot, username, 'kali');
      showVmInfo({ kali: { state: 'running', shared: { shared: folder } } });

      await expect(ipcMain.invoke('local-vms:copy-to-shared', {}, 'kali', ['/nope/one', '/nope/two']))
        .rejects.toThrow('None of the dropped items could be copied');
      await expect(ipcMain.invoke('local-vms:copy-to-shared', {}, 'kali', []))
        .rejects.toThrow('No files to copy');
    });

    it('opens the shared folder in the system file manager', async () => {
      const folder = path.join(sharedRoot, username, 'kali');
      showVmInfo({ kali: { state: 'running', shared: { shared: folder } } });

      const result = await ipcMain.invoke('local-vms:open-shared-folder', {}, 'kali');
      expect(result).toEqual({ success: true, path: folder });
      expect(vi.mocked(shell.openPath)).toHaveBeenCalledExactlyOnceWith(folder);
      // ensureSharedFolder created the directory before opening it
      expect(fs.existsSync(folder)).toBe(true);
    });

    it('allocates a fresh ".N" folder instead of reusing leftover data from a deleted VM', async () => {
      const base = path.join(sharedRoot, username, 'kali');
      await fs.promises.mkdir(base, { recursive: true });
      await fs.promises.writeFile(path.join(base, 'old.txt'), 'kept from a deleted VM');
      listVms('kali');
      showVmInfo({ kali: { state: 'poweroff' } });

      await ipcMain.invoke('local-vms:start', {}, 'kali');

      expect(commandsIssued('sharedfolder')[0]).toContain(`${base}.2`);
      expect(fs.existsSync(`${base}.2`)).toBe(true);
      expect(fs.existsSync(path.join(base, 'old.txt'))).toBe(true);
    });

    it('propagates file manager errors', async () => {
      showVmInfo({ kali: { state: 'poweroff' } });
      vi.mocked(shell.openPath).mockResolvedValueOnce('No application found');

      await expect(ipcMain.invoke('local-vms:open-shared-folder', {}, 'kali'))
        .rejects.toThrow('No application found');
    });
  });
});
