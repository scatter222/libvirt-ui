import { expect, test } from './electron-app';

// This flow crosses the full stack: a click in the renderer navigates to the
// Tools screen, which calls the preload bridge (electron.ipcRenderer.invoke
// 'tools:list'); the main-process handler in toolsIPC.ts reads and parses the
// real config/tools.yaml and the results render as tool cards.
test.describe('tools dashboard', () => {
  test('lists the tools from config/tools.yaml after navigating to the Tools tab', async ({ window }) => {
    await window.getByRole('button', { name: 'Tools' }).click();

    // Tool display names defined in config/tools.yaml, served over IPC.
    await expect(window.getByText('Nmap - Network Mapper')).toBeVisible();
    await expect(window.getByText('Wireshark - Network Protocol Analyzer')).toBeVisible();

    // Navigating back re-renders the Dashboard screen.
    await window.getByRole('button', { name: 'Dashboard' }).click();
    await expect(window.getByRole('heading', { name: 'Cyber Operations Dashboard' })).toBeVisible();
    await expect(window.getByText('Nmap - Network Mapper')).not.toBeVisible();
  });
});
