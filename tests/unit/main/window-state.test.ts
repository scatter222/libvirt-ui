import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { getWindowState, registerWindowStateChangedEvents } from '@/windowState';

class FakeBrowserWindow extends EventEmitter {
  fullScreen = false;
  maximized = false;
  minimized = false;
  visible = true;

  webContents = {
    destroyed: false,
    isDestroyed: () => this.webContents.destroyed,
    send: vi.fn()
  };

  isFullScreen () { return this.fullScreen; }
  isMaximized () { return this.maximized; }
  isMinimized () { return this.minimized; }
  isVisible () { return this.visible; }

  asBrowserWindow () {
    return this as unknown as Electron.BrowserWindow;
  }
}

describe('getWindowState', () => {
  it('maps window flags to a state name', () => {
    const window = new FakeBrowserWindow();
    expect(getWindowState(window.asBrowserWindow())).toBe('normal');

    window.minimized = true;
    expect(getWindowState(window.asBrowserWindow())).toBe('minimized');

    window.maximized = true;
    expect(getWindowState(window.asBrowserWindow())).toBe('maximized');

    window.fullScreen = true;
    expect(getWindowState(window.asBrowserWindow())).toBe('full-screen');

    window.fullScreen = false;
    window.maximized = false;
    window.minimized = false;
    window.visible = false;
    expect(getWindowState(window.asBrowserWindow())).toBe('hidden');
  });

  it('prefers full-screen over maximized and maximized over minimized', () => {
    const window = new FakeBrowserWindow();
    window.fullScreen = true;
    window.maximized = true;
    window.minimized = true;
    expect(getWindowState(window.asBrowserWindow())).toBe('full-screen');

    window.fullScreen = false;
    expect(getWindowState(window.asBrowserWindow())).toBe('maximized');
  });
});

describe('registerWindowStateChangedEvents', () => {
  function lastStateSentBy (window: FakeBrowserWindow): unknown[] {
    const { calls } = window.webContents.send.mock;
    return calls[calls.length - 1];
  }

  it('forwards window state transitions to the renderer on the window-state-changed channel', () => {
    const window = new FakeBrowserWindow();
    registerWindowStateChangedEvents(window.asBrowserWindow());

    window.emit('maximize');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'maximized']);

    window.emit('unmaximize');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'normal']);

    window.emit('enter-full-screen');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'full-screen']);

    window.emit('minimize');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'minimized']);

    window.emit('hide');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'hidden']);
  });

  it('reports normal after leaving full screen even if the window still claims to be full screen', () => {
    // Electron still returns isFullScreen() === true directly after the
    // leave-full-screen event; the handler must hardcode 'normal'.
    const window = new FakeBrowserWindow();
    window.fullScreen = true;
    registerWindowStateChangedEvents(window.asBrowserWindow());

    window.emit('leave-full-screen');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'normal']);
  });

  it('inspects the actual window state on show instead of assuming normal', () => {
    const window = new FakeBrowserWindow();
    registerWindowStateChangedEvents(window.asBrowserWindow());

    window.maximized = true;
    window.emit('show');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'maximized']);

    window.maximized = false;
    window.emit('show');
    expect(lastStateSentBy(window)).toEqual(['window-state-changed', 'normal']);
  });
});
