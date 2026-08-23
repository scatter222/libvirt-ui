import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { app, ipcMain, shell } from '../../mocks/electron';

const CONFIG = {
  systems: [
    { id: 'flare-vm', name: 'FLARE-VM', os: 'Windows', color: 'blue', icon: 'Monitor', description: 'Windows RE' },
    { id: 'remnux', name: 'REMnux', os: 'Linux', color: 'green', icon: 'Terminal', description: 'Linux RE' }
  ],
  categories: [
    { id: 'recon', name: 'Recon', icon: 'Search', color: 'blue', description: 'Recon tools' },
    { id: 'forensics', name: 'Forensics', icon: 'Disc', color: 'red', description: 'Forensics tools' }
  ],
  missions: [
    { id: 'triage', name: 'Triage', description: 'Malware triage', categories: ['forensics'] }
  ],
  tools: [
    { id: 'flare-vm__ghidra', name: 'ghidra', displayName: 'Ghidra', description: 'SRE suite', system: 'flare-vm', category: 'forensics', interface: 'gui', tags: ['sre'], documentation: { quickStart: 'ghidra', examples: [{ description: 'Launch', command: 'ghidra' }] } },
    { id: 'flare-vm__nmap', name: 'nmap', displayName: 'Nmap', description: 'Scanner', system: 'flare-vm', category: 'recon', interface: 'cli', tags: ['scanner'], documentation: { quickStart: 'nmap', examples: [{ description: 'Scan', command: 'nmap -sV host' }] } },
    { id: 'remnux__volatility', name: 'volatility', displayName: 'Volatility', description: 'Memory forensics', system: 'remnux', category: 'forensics', interface: 'cli', tags: ['memory'], documentation: { quickStart: 'vol', examples: [{ description: 'Info', command: 'vol -f mem.raw info' }] } }
  ],
  settings: {}
};

describe('toolsIPC', () => {
  beforeAll(async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tools-ipc-'));
    await fs.promises.mkdir(path.join(tmpDir, 'config'));
    await fs.promises.writeFile(path.join(tmpDir, 'config/tools.json'), JSON.stringify(CONFIG));

    app.setAppPath(tmpDir);
    const mod = await import('@/ipc/toolsIPC');
    mod.setupToolsIPC();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves the tool catalog and taxonomy parsed from config/tools.json', async () => {
    const tools = await ipcMain.invoke('tools:list') as Array<{ id: string }>;
    expect(tools.map((t) => t.id)).toEqual(['flare-vm__ghidra', 'flare-vm__nmap', 'remnux__volatility']);

    const systems = await ipcMain.invoke('tools:systems') as Array<{ id: string }>;
    expect(systems.map((s) => s.id)).toEqual(['flare-vm', 'remnux']);

    const categories = await ipcMain.invoke('tools:categories') as Array<{ id: string }>;
    expect(categories.map((c) => c.id)).toEqual(['recon', 'forensics']);
  });

  it('filters tools by system and by category', async () => {
    const bySystem = await ipcMain.invoke('tools:by-system', {}, 'flare-vm') as Array<{ id: string }>;
    expect(bySystem.map((t) => t.id)).toEqual(['flare-vm__ghidra', 'flare-vm__nmap']);

    const byCategory = await ipcMain.invoke('tools:by-category', {}, 'forensics') as Array<{ id: string }>;
    expect(byCategory.map((t) => t.id)).toEqual(['flare-vm__ghidra', 'remnux__volatility']);

    expect(await ipcMain.invoke('tools:by-system', {}, 'no-such-system')).toEqual([]);
  });

  it('resolves a mission to the tools of its categories', async () => {
    const tools = await ipcMain.invoke('tools:by-mission', {}, 'triage') as Array<{ id: string }>;
    expect(tools.map((t) => t.id)).toEqual(['flare-vm__ghidra', 'remnux__volatility']);
  });

  it('returns an empty list for an unknown mission', async () => {
    expect(await ipcMain.invoke('tools:by-mission', {}, 'nope')).toEqual([]);
  });

  it('opens documentation links externally', async () => {
    const result = await ipcMain.invoke('tools:open-docs', {}, 'https://ghidra-sre.org');
    expect(result).toEqual({ success: true });
    expect(vi.mocked(shell.openExternal)).toHaveBeenCalledExactlyOnceWith('https://ghidra-sre.org');
  });

  it('falls back to an empty catalog when the config file is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const emptyDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tools-ipc-empty-'));
    // resetModules gives the re-imported module a fresh electron mock too, so
    // the fresh ipcMain instance must be used for the invocations
    vi.resetModules();
    const fresh = await import('../../mocks/electron');
    fresh.app.setAppPath(emptyDir);
    const mod = await import('@/ipc/toolsIPC');
    mod.setupToolsIPC();

    expect(await fresh.ipcMain.invoke('tools:list')).toEqual([]);
    expect(await fresh.ipcMain.invoke('tools:systems')).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
