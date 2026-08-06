import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendToRenderer } from '@/webContents';

function fakeWebContents (destroyed: boolean) {
  return {
    isDestroyed: () => destroyed,
    send: vi.fn()
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendToRenderer', () => {
  it('delivers the channel and payload to a live webContents', () => {
    const webContents = fakeWebContents(false);

    sendToRenderer(webContents as unknown as Electron.WebContents, 'window-state-changed', 'maximized');

    expect(webContents.send).toHaveBeenCalledExactlyOnceWith('window-state-changed', 'maximized');
  });

  it('logs instead of crashing when the webContents is already destroyed', () => {
    // __DEV__ is false under Vitest (see vitest.config.ts), so the packaged
    // code path applies: an error is logged and nothing is sent.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const webContents = fakeWebContents(true);

    sendToRenderer(webContents as unknown as Electron.WebContents, 'menu-event');

    expect(webContents.send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith('failed to send on menu-event, webContents was destroyed');
  });
});
