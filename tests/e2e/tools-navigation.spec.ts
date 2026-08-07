import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from './electron-app';

// The expected catalog is read from the same config file the main process
// serves over IPC, so these tests stay correct as tools are added or removed.
interface ToolsConfig {
  systems: Array<{ id: string; name: string }>;
  tools: Array<{ system: string; displayName: string }>;
}

const configPath = path.resolve(import.meta.dirname, '../../config/tools.json');
const toolsConfig: ToolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const totalTools = toolsConfig.tools.length;

// This flow crosses the full stack: a click in the renderer navigates to the
// Tools screen, which calls the preload bridge (electron.ipcRenderer.invoke
// 'tools:list' / 'tools:systems'); the main-process handlers in toolsIPC.ts
// read and parse the real config/tools.json and the catalog renders as cards.
test.describe('tools dashboard', () => {
  test('shows the full catalog from config/tools.json with per-system counts', async ({ window }) => {
    await window.getByRole('button', { name: 'Tools' }).click();

    await expect(window.getByRole('heading', { name: 'Security Tools Arsenal' })).toBeVisible();
    await expect(window.getByText(`${totalTools} tools across ${toolsConfig.systems.length} systems`)).toBeVisible();

    // One filter chip per system, each labeled with that system's tool count.
    await expect(window.getByRole('button', { name: `All (${totalTools})` })).toBeVisible();
    for (const system of toolsConfig.systems) {
      const count = toolsConfig.tools.filter((tool) => tool.system === system.id).length;
      await expect(window.getByRole('button', { name: `${system.name} (${count})` })).toBeVisible();
    }

    await expect(window.getByText(`Showing ${totalTools} of ${totalTools} tools`)).toBeVisible();
  });

  test('filters the catalog by system chip and by search', async ({ window }) => {
    const [firstSystem] = toolsConfig.systems;
    const systemCount = toolsConfig.tools.filter((tool) => tool.system === firstSystem.id).length;

    await window.getByRole('button', { name: 'Tools' }).click();
    await expect(window.getByRole('heading', { name: 'Security Tools Arsenal' })).toBeVisible();

    // Filtering by a system narrows the grid to that system's tools.
    await window.getByRole('button', { name: `${firstSystem.name} (${systemCount})` }).click();
    await expect(window.getByText(`Showing ${systemCount} of ${totalTools} tools`)).toBeVisible();

    // Clicking the active chip again clears the filter.
    await window.getByRole('button', { name: `${firstSystem.name} (${systemCount})` }).click();
    await expect(window.getByText(`Showing ${totalTools} of ${totalTools} tools`)).toBeVisible();

    // Search narrows the grid and surfaces matching cards.
    const search = window.getByPlaceholder('Search tools by name, description, or tags...');
    await search.fill('ghidra');
    await expect(window.getByText('Ghidra — SRE suite').first()).toBeVisible();
    await expect(window.getByText(`of ${totalTools} tools`)).toBeVisible();
    const shown = await window.locator('.grid > *').count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(totalTools);

    // A query matching nothing shows the empty state.
    await search.fill('no-such-tool-zzzz');
    await expect(window.getByRole('heading', { name: 'No Tools Found' })).toBeVisible();
    await expect(window.getByText('No tools match your search "no-such-tool-zzzz"')).toBeVisible();
  });
});
