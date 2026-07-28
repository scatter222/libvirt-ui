#!/usr/bin/env node

/**
 * Integration test for local VM management.
 *
 * This exercises the exact same logic as localVmIPC.ts but without Electron.
 * It parses the real config/local-vms.yaml, calls VBoxManage, and verifies
 * every IPC handler path the Electron app would use, including the
 * template/instance model, adoption of manually-created VMs, multi-instance
 * deployment, and per-user shared folders.
 *
 * Run on the workstation:
 *   node tests/test-local-vms.mjs
 */

import { execFile } from 'child_process';
import { readFile, access, mkdir, constants } from 'fs/promises';
import { homedir, userInfo } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { parse as parseYaml } from 'yaml';

const execFileAsync = promisify(execFile);

const CONFIG_PATH = join(import.meta.dirname, '..', 'config', 'local-vms.yaml');
const SHARED_FOLDER_NAME = 'shared';

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    pass++;
  } else {
    console.log(`  FAIL: ${label}`);
    fail++;
  }
}

// ============================================
// Same helpers as localVmIPC.ts
// ============================================

async function vboxManage(args, timeoutMs = 2 * 60 * 1000) {
  try {
    const { stdout } = await execFileAsync('VBoxManage', args, {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message || String(error);
    throw new Error(`VBoxManage ${args[0]} failed: ${detail}`);
  }
}

async function getRegisteredVms() {
  try {
    const output = await vboxManage(['list', 'vms']);
    const names = new Set();
    for (const line of output.split('\n')) {
      const match = line.match(/^"(.+?)"/);
      if (match) names.add(match[1]);
    }
    return names;
  } catch {
    return new Set();
  }
}

function parseVmState(raw) {
  if (raw === 'running') return 'running';
  if (raw === 'paused') return 'paused';
  if (raw === 'saved') return 'suspended';
  return 'stopped';
}

async function getVmInfo(vmName) {
  const info = { state: 'stopped', sharedFolders: new Map() };
  try {
    const output = await vboxManage(['showvminfo', vmName, '--machinereadable']);
    const stateMatch = output.match(/^VMState="(.+?)"$/m);
    info.state = parseVmState(stateMatch?.[1]);

    const memMatch = output.match(/^memory=(\d+)$/m);
    if (memMatch) info.memory = parseInt(memMatch[1], 10);

    const cpuMatch = output.match(/^cpus=(\d+)$/m);
    if (cpuMatch) info.cpus = parseInt(cpuMatch[1], 10);

    const nameRe = /^SharedFolderNameMachineMapping(\d+)="(.+?)"$/gm;
    let m;
    while ((m = nameRe.exec(output)) !== null) {
      const idx = m[1];
      const pathMatch = output.match(new RegExp(`^SharedFolderPathMachineMapping${idx}="(.+?)"$`, 'm'));
      info.sharedFolders.set(m[2], pathMatch?.[1] ?? '');
    }
  } catch {
    // Missing VM reads as stopped
  }
  return info;
}

async function getVmState(vmName) {
  return (await getVmInfo(vmName)).state;
}

function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function sharedFolderPathFor(config, instanceName) {
  const root = expandHome(config.settings.sharedFoldersDirectory || '~/vm-shared');
  return join(root, userInfo().username, instanceName);
}

function instancesOfTemplate(templateName, registered) {
  const re = new RegExp(`^${templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(-\\d+)?$`);
  return [...registered]
    .filter((name) => re.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nextInstanceName(templateName, registered) {
  if (!registered.has(templateName)) return templateName;
  for (let n = 2; ; n++) {
    const candidate = `${templateName}-${n}`;
    if (!registered.has(candidate)) return candidate;
  }
}

async function ensureSharedFolder(config, instanceName) {
  const hostPath = sharedFolderPathFor(config, instanceName);
  await mkdir(hostPath, { recursive: true });
  const vmInfo = await getVmInfo(instanceName);
  if (vmInfo.sharedFolders.has(SHARED_FOLDER_NAME)) return hostPath;
  if (vmInfo.state === 'running' || vmInfo.state === 'paused') return hostPath;
  await vboxManage([
    'sharedfolder', 'add', instanceName,
    '--name', SHARED_FOLDER_NAME,
    '--hostpath', hostPath,
    '--automount',
  ]);
  return hostPath;
}

async function deployInstance(config, tpl) {
  const registered = await getRegisteredVms();
  const instanceName = nextInstanceName(tpl.name, registered);
  const ovaPath = join(config.settings.imagesDirectory, tpl.ovaFile);
  await access(ovaPath, constants.F_OK);
  await vboxManage(['import', ovaPath, '--vsys', '0', '--vmname', instanceName], 20 * 60 * 1000);
  await vboxManage(['modifyvm', instanceName, '--memory', String(tpl.specs.memory), '--cpus', String(tpl.specs.cpus)]);
  await ensureSharedFolder(config, instanceName);
  return instanceName;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Test Suite
// ============================================

console.log('============================================');
console.log(' Local VM Integration Tests');
console.log(' (same logic as localVmIPC.ts)');
console.log('============================================\n');

// --- Test 1: Config loading ---
console.log('[1] Config loading (loadConfig)');
let config;
try {
  const contents = await readFile(CONFIG_PATH, 'utf8');
  config = parseYaml(contents);
  assert(config !== null, 'YAML parsed successfully');
  assert(config.settings?.imagesDirectory, `imagesDirectory: ${config.settings.imagesDirectory}`);
  assert(config.settings?.sharedFoldersDirectory, `sharedFoldersDirectory: ${config.settings.sharedFoldersDirectory}`);
  assert(config.vms?.length > 0, `${config.vms.length} VM templates configured`);
  assert(typeof config.settings.autoRefresh === 'boolean', `autoRefresh: ${config.settings.autoRefresh}`);
  assert(typeof config.settings.refreshInterval === 'number', `refreshInterval: ${config.settings.refreshInterval}ms`);
} catch (err) {
  assert(false, `Config load failed: ${err.message}`);
  process.exit(1);
}

// --- Test 2: Instance naming + adoption matching (pure logic) ---
console.log('\n[2] Instance name allocation and adoption matching');
{
  const reg = new Set();
  assert(nextInstanceName('remnux', reg) === 'remnux', 'first instance uses the bare template name');
  reg.add('remnux');
  assert(nextInstanceName('remnux', reg) === 'remnux-2', 'second instance gets -2 suffix');
  reg.add('remnux-2');
  assert(nextInstanceName('remnux', reg) === 'remnux-3', 'third instance gets -3 suffix');
  reg.delete('remnux-2');
  assert(nextInstanceName('remnux', reg) === 'remnux-2', 'gaps in numbering are reused');

  // Adoption: manually created VMs with matching names are picked up
  const manual = new Set(['remnux', 'remnux-2', 'remnux-fake', 'sift-workstation', 'unrelated-vm']);
  const adopted = instancesOfTemplate('remnux', manual);
  assert(adopted.length === 2 && adopted[0] === 'remnux' && adopted[1] === 'remnux-2',
    `adopts exact + numbered matches only: [${adopted.join(', ')}]`);
  assert(instancesOfTemplate('sift-workstation', manual).length === 1, 'other template matches its own VM');
  assert(instancesOfTemplate('sift', manual).length === 0, 'prefix alone does not match (sift vs sift-workstation)');
}

// --- Test 3: Shared folder path layout ---
console.log('\n[3] Shared folder path layout');
{
  const p = sharedFolderPathFor(config, 'remnux-2');
  const user = userInfo().username;
  assert(p.includes(`/${user}/`), `path contains username: ${p}`);
  assert(p.endsWith('/remnux-2'), 'path ends with instance name');
}

// --- Test 4: OVA files exist ---
console.log('\n[4] OVA file resolution');
for (const vm of config.vms) {
  const ovaPath = join(config.settings.imagesDirectory, vm.ovaFile);
  try {
    await access(ovaPath, constants.F_OK);
    assert(true, `${vm.name}: ${ovaPath} exists`);
  } catch {
    assert(false, `${vm.name}: ${ovaPath} NOT FOUND`);
  }
}

// --- Test 5: List (local-vms:list handler shape) ---
console.log('\n[5] local-vms:list (templates + instances)');
const registeredBefore = await getRegisteredVms();
for (const tpl of config.vms) {
  const instanceNames = instancesOfTemplate(tpl.name, registeredBefore);
  assert(tpl.specs.memory > 0 && tpl.specs.cpus > 0, `${tpl.name}: specs ${tpl.specs.memory}MB/${tpl.specs.cpus}cpu`);
  assert(Array.isArray(tpl.tags) && tpl.tags.length > 0, `${tpl.name}: ${tpl.tags.length} tags`);
  console.log(`  INFO: ${tpl.name} has ${instanceNames.length} existing instance(s)`);
}

// --- Test 6: Deploy two instances of the first template ---
const testTpl = config.vms[0];
console.log(`\n[6] Multi-instance deploy: ${testTpl.name}`);
const deployed = [];

console.log('  [6a] Deploy first instance (import + specs + shared folder)');
try {
  const name = await deployInstance(config, testTpl);
  deployed.push(name);
  const registered = await getRegisteredVms();
  assert(registered.has(name), `instance registered: ${name}`);
  const info = await getVmInfo(name);
  assert(info.memory === testTpl.specs.memory, `memory applied: ${info.memory}MB`);
  assert(info.cpus === testTpl.specs.cpus, `cpus applied: ${info.cpus}`);
  assert(info.sharedFolders.has(SHARED_FOLDER_NAME), 'shared folder attached');
  const hostPath = info.sharedFolders.get(SHARED_FOLDER_NAME);
  assert(hostPath === sharedFolderPathFor(config, name), `shared folder host path: ${hostPath}`);
  await access(hostPath, constants.F_OK);
  assert(true, 'shared folder directory exists on host');
} catch (err) {
  assert(false, `First deploy failed: ${err.message}`);
}

console.log('  [6b] Deploy second instance of the same template');
try {
  const name = await deployInstance(config, testTpl);
  deployed.push(name);
  assert(name !== deployed[0], `unique instance name allocated: ${name}`);
  const registered = await getRegisteredVms();
  assert(registered.has(name), `second instance registered: ${name}`);
  const info = await getVmInfo(name);
  assert(info.sharedFolders.has(SHARED_FOLDER_NAME), 'second instance has its own shared folder');
  assert(info.sharedFolders.get(SHARED_FOLDER_NAME) !== sharedFolderPathFor(config, deployed[0]),
    'shared folders are per-instance, not shared between instances');
  const adopted = instancesOfTemplate(testTpl.name, registered);
  assert(adopted.length >= 2, `list now shows ${adopted.length} instances of ${testTpl.name}`);
} catch (err) {
  assert(false, `Second deploy failed: ${err.message}`);
}

// --- Test 7: Lifecycle on the first deployed instance ---
const lifecycleVm = deployed[0];
if (lifecycleVm) {
  console.log(`\n[7] Lifecycle: ${lifecycleVm}`);

  console.log('  [7a] Start VM');
  try {
    // Use headless since we may not have a display
    await vboxManage(['startvm', lifecycleVm, '--type', 'headless']);
    await sleep(3000);
    const state = await getVmState(lifecycleVm);
    assert(state === 'running', `State after start: ${state}`);
  } catch (err) {
    assert(false, `Start failed: ${err.message}`);
  }

  console.log('  [7b] ensureSharedFolder is a no-op while running');
  try {
    await ensureSharedFolder(config, lifecycleVm);
    assert(true, 'no error when VM already running with folder attached');
  } catch (err) {
    assert(false, `ensureSharedFolder failed: ${err.message}`);
  }

  console.log('  [7c] Stop VM (force)');
  try {
    await vboxManage(['controlvm', lifecycleVm, 'poweroff']);
    await sleep(2000);
    const state = await getVmState(lifecycleVm);
    assert(state === 'stopped', `State after stop: ${state}`);
  } catch (err) {
    assert(false, `Stop failed: ${err.message}`);
  }

  console.log('  [7d] Start + restart');
  try {
    await vboxManage(['startvm', lifecycleVm, '--type', 'headless']);
    await sleep(3000);
    try {
      await vboxManage(['controlvm', lifecycleVm, 'reset']);
    } catch {
      // Fallback: poweroff + start
      await vboxManage(['controlvm', lifecycleVm, 'poweroff']);
      await sleep(2000);
      await vboxManage(['startvm', lifecycleVm, '--type', 'headless']);
    }
    await sleep(3000);
    const state = await getVmState(lifecycleVm);
    assert(state === 'running', `State after restart: ${state}`);
  } catch (err) {
    assert(false, `Restart failed: ${err.message}`);
  }
}

// --- Test 8: Delete all deployed instances ---
console.log('\n[8] Delete deployed instances');
for (const name of deployed) {
  try {
    const state = await getVmState(name);
    if (state === 'running' || state === 'paused') {
      await vboxManage(['controlvm', name, 'poweroff']);
      await sleep(2000);
    }
    await vboxManage(['unregistervm', name, '--delete']);
    const registered = await getRegisteredVms();
    assert(!registered.has(name), `${name} unregistered after delete`);
  } catch (err) {
    assert(false, `Delete ${name} failed: ${err.message}`);
  }
}

// --- Test 9: Clean state after delete ---
console.log('\n[9] Clean state after delete');
const registeredAfter = await getRegisteredVms();
for (const name of deployed) {
  assert(!registeredAfter.has(name), `${name} not in VBoxManage list`);
}
if (deployed[0]) {
  const stateAfter = await getVmState(deployed[0]);
  assert(stateAfter === 'stopped', `getVmInfo returns "stopped" for missing VM (got: ${stateAfter})`);
}

// --- Test 10: Reload config (local-vms:reload-config) ---
console.log('\n[10] Reload config');
try {
  const reloaded = parseYaml(await readFile(CONFIG_PATH, 'utf8'));
  assert(reloaded.vms.length === config.vms.length, `Config reloaded: ${reloaded.vms.length} VMs`);
} catch (err) {
  assert(false, `Reload failed: ${err.message}`);
}

// --- Results ---
console.log('\n============================================');
console.log(` Results: ${pass} passed, ${fail} failed`);
console.log('============================================');
process.exit(fail > 0 ? 1 : 0);
