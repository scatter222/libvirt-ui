#!/usr/bin/env node

/**
 * Integration test for local VM management.
 *
 * This exercises the exact same logic as localVmIPC.ts but without Electron.
 * It parses the real config/local-vms.yaml, calls VBoxManage, and verifies
 * every IPC handler path the Electron app would use.
 *
 * Run on the workstation:
 *   node tests/test-local-vms.mjs
 */

import { exec } from 'child_process';
import { readFile, access, constants } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { parse as parseYaml } from 'yaml';

const execAsync = promisify(exec);

const CONFIG_PATH = join(import.meta.dirname, '..', 'config', 'local-vms.yaml');

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

async function vboxManage(args) {
  try {
    const { stdout } = await execAsync(`VBoxManage ${args}`);
    return stdout.trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`VBoxManage failed: ${msg}`);
  }
}

async function getRegisteredVms() {
  try {
    const output = await vboxManage('list vms');
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

async function getVmState(vmName) {
  try {
    const output = await vboxManage(`showvminfo "${vmName}" --machinereadable`);
    const match = output.match(/VMState="(.+?)"/);
    if (!match) return 'stopped';
    const state = match[1];
    if (state === 'running') return 'running';
    if (state === 'paused') return 'paused';
    if (state === 'saved') return 'suspended';
    return 'stopped';
  } catch {
    return 'stopped';
  }
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
  assert(config.vms?.length > 0, `${config.vms.length} VMs configured`);
  assert(typeof config.settings.autoRefresh === 'boolean', `autoRefresh: ${config.settings.autoRefresh}`);
  assert(typeof config.settings.refreshInterval === 'number', `refreshInterval: ${config.settings.refreshInterval}ms`);
} catch (err) {
  assert(false, `Config load failed: ${err.message}`);
  process.exit(1);
}

// --- Test 2: OVA files exist ---
console.log('\n[2] OVA file resolution');
for (const vm of config.vms) {
  const ovaPath = join(config.settings.imagesDirectory, vm.ovaFile);
  try {
    await access(ovaPath, constants.F_OK);
    assert(true, `${vm.name}: ${ovaPath} exists`);
  } catch {
    assert(false, `${vm.name}: ${ovaPath} NOT FOUND`);
  }
}

// --- Test 3: List VMs (local-vms:list handler) ---
console.log('\n[3] local-vms:list');
const registeredBefore = await getRegisteredVms();
const vmList = [];
for (const tpl of config.vms) {
  const ovaPath = join(config.settings.imagesDirectory, tpl.ovaFile);
  const imported = registeredBefore.has(tpl.name);
  let state = 'available';
  if (imported) {
    state = await getVmState(tpl.name);
  }
  vmList.push({
    name: tpl.name,
    displayName: tpl.displayName,
    description: tpl.description,
    category: tpl.category,
    state,
    memory: tpl.specs.memory,
    cpus: tpl.specs.cpus,
    tags: tpl.tags,
    ovaPath,
    imported,
  });
}
assert(vmList.length === config.vms.length, `Listed ${vmList.length} VMs`);
for (const vm of vmList) {
  assert(vm.state === 'available' || vm.state === 'stopped', `${vm.name}: state=${vm.state}, imported=${vm.imported}`);
  assert(vm.memory > 0, `${vm.name}: memory=${vm.memory}MB`);
  assert(vm.cpus > 0, `${vm.name}: cpus=${vm.cpus}`);
  assert(vm.tags.length > 0, `${vm.name}: ${vm.tags.length} tags`);
}

// --- Test 4: Full lifecycle for first VM ---
const testVm = config.vms[0];
const testOvaPath = join(config.settings.imagesDirectory, testVm.ovaFile);
console.log(`\n[4] Full lifecycle: ${testVm.name}`);

// 4a: Import (local-vms:start when not registered)
console.log('  [4a] Import OVA + apply specs');
try {
  await access(testOvaPath, constants.F_OK);
  await vboxManage(`import "${testOvaPath}" --vsys 0 --vmname "${testVm.name}"`);
  await vboxManage(`modifyvm "${testVm.name}" --memory ${testVm.specs.memory} --cpus ${testVm.specs.cpus}`);
  const registered = await getRegisteredVms();
  assert(registered.has(testVm.name), 'VM registered after import');
} catch (err) {
  assert(false, `Import failed: ${err.message}`);
}

// 4b: Start (local-vms:start)
console.log('  [4b] Start VM');
try {
  // Use headless since we may not have a display
  await vboxManage(`startvm "${testVm.name}" --type headless`);
  await sleep(3000);
  const state = await getVmState(testVm.name);
  assert(state === 'running', `State after start: ${state}`);
} catch (err) {
  assert(false, `Start failed: ${err.message}`);
}

// 4c: Get state (local-vms:get-state)
console.log('  [4c] Get state');
try {
  const registered = await getRegisteredVms();
  let state;
  if (!registered.has(testVm.name)) {
    state = 'available';
  } else {
    state = await getVmState(testVm.name);
  }
  assert(state === 'running', `get-state returned: ${state}`);
} catch (err) {
  assert(false, `get-state failed: ${err.message}`);
}

// 4d: Stop (local-vms:stop with force)
console.log('  [4d] Stop VM (force)');
try {
  await vboxManage(`controlvm "${testVm.name}" poweroff`);
  await sleep(2000);
  const state = await getVmState(testVm.name);
  assert(state === 'stopped', `State after stop: ${state}`);
} catch (err) {
  assert(false, `Stop failed: ${err.message}`);
}

// 4e: Restart cycle (start → restart → verify running)
console.log('  [4e] Start + restart');
try {
  await vboxManage(`startvm "${testVm.name}" --type headless`);
  await sleep(3000);
  try {
    await vboxManage(`controlvm "${testVm.name}" reset`);
  } catch {
    // Fallback: poweroff + start
    await vboxManage(`controlvm "${testVm.name}" poweroff`);
    await sleep(2000);
    await vboxManage(`startvm "${testVm.name}" --type headless`);
  }
  await sleep(3000);
  const state = await getVmState(testVm.name);
  assert(state === 'running', `State after restart: ${state}`);
} catch (err) {
  assert(false, `Restart failed: ${err.message}`);
}

// 4f: Delete (local-vms:delete)
console.log('  [4f] Delete VM');
try {
  const state = await getVmState(testVm.name);
  if (state === 'running') {
    await vboxManage(`controlvm "${testVm.name}" poweroff`);
    await sleep(2000);
  }
  await vboxManage(`unregistervm "${testVm.name}" --delete`);
  const registered = await getRegisteredVms();
  assert(!registered.has(testVm.name), 'VM unregistered after delete');
} catch (err) {
  assert(false, `Delete failed: ${err.message}`);
}

// --- Test 5: Verify clean state after delete ---
console.log('\n[5] Clean state after delete');
const registeredAfter = await getRegisteredVms();
assert(!registeredAfter.has(testVm.name), `${testVm.name} not in VBoxManage list`);
const stateAfter = await getVmState(testVm.name);
assert(stateAfter === 'stopped', `getVmState returns "stopped" for missing VM (got: ${stateAfter})`);

// --- Test 6: Reload config (local-vms:reload-config) ---
console.log('\n[6] Reload config');
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
