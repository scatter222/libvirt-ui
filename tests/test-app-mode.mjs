#!/usr/bin/env node

/**
 * Validates the deployment mode catalog and the mode file parser.
 *
 * This mirrors the logic in src/modes/appMode.ts (which cannot be imported
 * here because it pulls in Electron) and runs it against the real
 * config/modes.yaml, so a typo in the catalog is caught before it ships.
 *
 *   node tests/test-app-mode.mjs
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const CATALOG_PATH = join(import.meta.dirname, '..', 'config', 'modes.yaml');
const FEATURES_PATH = join(import.meta.dirname, '..', 'src', 'modes', 'features.ts');

let pass = 0;
let fail = 0;

function check (name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

/** Same rules as parseModeFile() in src/modes/appMode.ts. */
function parseModeFile (contents) {
  const lines = contents
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  const first = lines[0];
  const keyed = /^mode\s*:\s*(.+)$/i.exec(first);
  const value = keyed ? keyed[1] : first;

  return value.replace(/^['"]|['"]$/g, '').trim() || null;
}

async function readFeatureIds () {
  const source = await readFile(FEATURES_PATH, 'utf8');
  const block = /export const FEATURES = \[([\s\S]*?)\] as const;/.exec(source);
  if (!block) throw new Error('Could not find the FEATURES list in features.ts');

  return block[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

console.log('\nMode file parsing');
check('bare id', parseModeFile('standalone\n') === 'standalone');
check('yaml style', parseModeFile('mode: training\n') === 'training');
check('quoted value', parseModeFile('mode: "maintenance"\n') === 'maintenance');
check('comments and blank lines ignored', parseModeFile('# set by ansible\n\n  full  \n') === 'full');
check('trailing comment stripped', parseModeFile('standalone # airgapped rig\n') === 'standalone');
check('empty file', parseModeFile('\n# nothing here\n') === null);

console.log('\nMode catalog');
const catalog = parseYaml(await readFile(CATALOG_PATH, 'utf8'));
const featureIds = await readFeatureIds();
const modeIds = Object.keys(catalog.modes ?? {});

check('catalog defines modes', modeIds.length > 0);
check(
  `defaultMode "${catalog.defaultMode}" exists`,
  Boolean(catalog.modes?.[catalog.defaultMode])
);

for (const key of Object.keys(catalog.defaults ?? {})) {
  check(`defaults.${key} is a known feature`, featureIds.includes(key));
}

for (const [id, definition] of Object.entries(catalog.modes ?? {})) {
  check(`${id}: has a label`, Boolean(definition?.label));
  check(`${id}: has a description`, Boolean(definition?.description));

  for (const [key, value] of Object.entries(definition?.features ?? {})) {
    check(`${id}: "${key}" is a known feature`, featureIds.includes(key));
    check(`${id}: "${key}" is a boolean`, typeof value === 'boolean');
  }

  // Resolved flags: defaults first, then the mode's own overrides.
  const resolved = { ...(catalog.defaults ?? {}), ...(definition?.features ?? {}) };
  check(
    `${id}: resolves every feature`,
    featureIds.every((feature) => typeof resolved[feature] === 'boolean'),
    `missing ${featureIds.filter((feature) => typeof resolved[feature] !== 'boolean').join(', ')}`
  );
  check(`${id}: dashboard stays reachable`, resolved.dashboard === true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
