import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import WindowControls from '@/app/components/window-controls';
import { MenuChannels } from '@/channels/menuChannels';

describe('WindowControls', () => {
  it('renders minimize, maximize and close buttons in the normal window state', () => {
    render(<WindowControls windowState='normal' />);

    expect(screen.getByRole('button', { name: 'minimize' })).toHaveAttribute('title', 'Minimize');
    expect(screen.getByRole('button', { name: 'maximize' })).toHaveAttribute('title', 'Maximize');
    expect(screen.getByRole('button', { name: 'close' })).toHaveAttribute('title', 'Close');
    expect(screen.queryByRole('button', { name: 'restore' })).not.toBeInTheDocument();
  });

  it('swaps the maximize button for a restore button when the window is maximized', () => {
    render(<WindowControls windowState='maximized' />);

    expect(screen.getByRole('button', { name: 'restore' })).toHaveAttribute('title', 'Restore');
    expect(screen.queryByRole('button', { name: 'maximize' })).not.toBeInTheDocument();
  });

  it('sends the window commands the main process registers handlers for', async () => {
    // These channel names are the renderer half of the IPC contract; main
    // registers ipcMain.handle for each in registerMenuIpc.
    const user = userEvent.setup();
    const invoke = vi.mocked(electron.ipcRenderer.invoke);

    render(<WindowControls windowState='normal' />);

    await user.click(screen.getByRole('button', { name: 'minimize' }));
    expect(invoke).toHaveBeenLastCalledWith(MenuChannels.WINDOW_MINIMIZE, 'normal');

    await user.click(screen.getByRole('button', { name: 'maximize' }));
    expect(invoke).toHaveBeenLastCalledWith(MenuChannels.WINDOW_TOGGLE_MAXIMIZE, 'normal');

    await user.click(screen.getByRole('button', { name: 'close' }));
    expect(invoke).toHaveBeenLastCalledWith(MenuChannels.WINDOW_CLOSE, 'normal');
  });
});
