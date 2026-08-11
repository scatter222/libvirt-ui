# E2E tests & recording new ones

## Running

```sh
pnpm test:e2e                 # builds via electron-forge package, then runs Playwright
xvfb-run -a pnpm test:e2e     # same, on a headless machine / CI
```

Tests use the launch fixture in `electron-app.ts`: the real build from
`.vite/`, one Electron instance per test (`workers: 1`), a throwaway
`--user-data-dir`, and `--no-sandbox` for containers.

## Recording new tests

**`playwright codegen` cannot attach to Electron — on any OS.** The recorder
CLI only launches browsers. What does work is Playwright's Inspector in debug
mode against our real app:

```sh
pnpm test:record
```

This launches the built app with `PWDEBUG=1` and pauses. The Playwright
Inspector opens next to the app window:

1. Press **Record** in the Inspector.
2. Click through the app — actions and locators are generated live. The
   "Pick locator" button is also useful for finding selectors without
   recording.
3. Copy the generated actions into a new spec. Recorded code calls the page
   `page`; in our fixture it's `window`:

   ```ts
   import { expect, test } from './electron-app';

   test('my new flow', async ({ window }) => {
     // paste recorded actions, s/page/window/
   });
   ```

   Keep only the actions/assertions — the recorder's own launch boilerplate
   (if any) is replaced by the fixture. Add real assertions: the Inspector
   toolbar can record `expect` assertions too (visibility, text, value).
4. The recorder drives the **last build**. After changing `src/`, rebuild:
   `pnpm exec electron-forge package`.

The Inspector window itself is rendered by Playwright's Chromium, so it must
be installed: `pnpm exec playwright install chromium`. That is the step that
is unsupported on Oracle/RHEL hosts — use the dev container below.

## Dev container (Oracle Linux / RHEL hosts)

Playwright doesn't support RHEL-family distros, and the Inspector needs its
Chromium. `.devcontainer/devcontainer.json` provides an Ubuntu-based
container (the official Playwright image, version-matched to
`@playwright/test`) with everything preinstalled. Recording is interactive,
so the container shows its windows on your host display via the X11 socket:

```sh
# on the host, once per login session:
xhost +local:
```

Then "Reopen in Container" in VS Code and run `pnpm test:record` inside.
Notes:

- **SELinux** (enforcing on Oracle Linux): the container runs with
  `--security-opt label=disable` so it can use `/tmp/.X11-unix`. Without it
  you get "Authorization required" / cannot-open-display errors.
- **Podman** instead of Docker: works (point VS Code's `dev.containers.dockerPath`
  at `podman`). Rootless podman maps container root to your user, which X
  likes; keep `xhost +local:` anyway.
- **Wayland sessions**: fine — Electron and the Inspector go through
  Xwayland, which serves the same `/tmp/.X11-unix` socket. `$DISPLAY` must be
  set in the shell you launch VS Code from.
- **Blank/black app window**: GPU passthrough issue — the container already
  sets `LIBGL_ALWAYS_SOFTWARE=1`; as a last resort add `--disable-gpu` to the
  launch args in `record.mjs`.
- **No display at all** (SSH box): recording needs eyes on the app. Either use
  X forwarding (`ssh -X`, slower but works), or run Xvfb + a VNC bridge
  (`x11vnc`/noVNC) inside the container and record through the VNC viewer.

Running the *existing* suite doesn't need any of this — Electron ships its own
runtime, so `xvfb-run -a pnpm test:e2e` works directly on the Oracle host.

## What the recorder can and can't capture

- It records renderer-side interactions (clicks, fills, keys) and locators.
- It does **not** record main-process assertions (`electronApp.evaluate`),
  IPC traffic, or native dialogs — write those by hand (see
  `smoke.spec.ts` for an `electronApp.evaluate` example). Native dialogs
  would hang a replay; stub them via `electronApp.evaluate` before the step
  that triggers them.
- Generated locators are a starting point — prefer role/text locators tied to
  real config data (see `tools-navigation.spec.ts`) over brittle CSS paths.
