import { expect, test } from './electron-app';

test.describe('application startup', () => {
  test('opens a visible window and renders the app shell', async ({ electronApp, window }) => {
    await expect(window).toHaveTitle('Electron Vite React');

    // The tab bar is the top-level navigation of the app shell.
    await expect(window.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'VMs' })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Web Apps' })).toBeVisible();

    // The BrowserWindow itself must have been shown (ready-to-show fired).
    const windowState = await electronApp.evaluate(({ BrowserWindow }) => {
      const [win] = BrowserWindow.getAllWindows();
      return {
        count: BrowserWindow.getAllWindows().length,
        visible: win.isVisible(),
        title: win.getTitle()
      };
    });
    expect(windowState.count).toBe(1);
    expect(windowState.visible).toBe(true);
  });
});
