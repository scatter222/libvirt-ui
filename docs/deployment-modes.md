# Deployment modes

The machine this app runs on can be in one of several states. The app reads
that state from a file on disk at startup and uses it to turn tabs, screens and
IPC channels on or off.

Nothing in the UI hard-codes "is this feature on" - everything asks the same
resolved state, and the main process enforces it.

## How a mode is chosen

Resolution order (first hit wins), in `src/modes/appMode.ts`:

1. `LIBVIRT_UI_MODE` environment variable
2. `--mode=<id>` command line switch
3. the **mode file**:
   - Linux: `/etc/libvirt-ui/mode`
   - Windows: `%PROGRAMDATA%\libvirt-ui\mode`
   - macOS: `/Library/Application Support/libvirt-ui/mode`
   - any path in `LIBVIRT_UI_MODE_FILE` (checked first)
   - `<userData>/mode` (per-user override, handy for testing)
4. `defaultMode` from `config/modes.yaml`

The mode file is one line - the mode id:

```
standalone
```

`mode: standalone` is also accepted, and `#` comments are ignored. If the id is
not in the catalog the app falls back to the default mode and shows a warning
badge in the tab bar rather than starting with everything off.

The file is polled every 5s, so flipping the machine's state changes the UI
live - no restart.

## What a mode means

`config/modes.yaml` is the catalog: the disk file names a mode, this file
defines what that mode allows.

```yaml
defaultMode: full

defaults:          # applied to every mode, then overridden per mode
  dashboard: true
  tools: true
  vms: true
  remoteVms: true
  webApps: true
  rules: true
  api: true
  devTools: false

modes:
  standalone:
    label: Standalone
    description: No connectivity to the lab API. Local VMs and tools only.
    features:
      remoteVms: false
      webApps: false
      rules: false
      api: false
```

Feature ids are declared in `src/modes/features.ts` (`FEATURES`) and are typed,
so a typo is a compile error in code and a warning at load time in YAML.
`src/modes/features.ts` also carries a built-in copy of the catalog, used if
`config/modes.yaml` is missing so a broken deployment still gets a usable app.

## Using it in the renderer

The main process resolves the mode *before* the window is created and passes it
to the preload script as `--app-mode=<json>`, so the first render already knows
what is on - no loading state, no flash of features that are meant to be off.
`AppModeProvider` seeds from that and subscribes to `mode:changed`.

```tsx
// a whole tab or route
<Route path='/vms' element={<FeatureRoute name='vms'><VMDashboard /></FeatureRoute>} />

// a button, card or section
<Feature name='rules'>
  <Button onClick={openRules}>Detection Rules</Button>
</Feature>

// imperatively
const canUseVms = useFeature('vms');
const { mode, label, isEnabled, reload } = useAppMode();
```

Tabs declare their feature in `src/app/components/tab-navigation.tsx` and are
filtered out when it is off; `FeatureRoute` bounces a disabled route back to the
dashboard, so an old `#/vms` URL cannot land on a hidden screen.

## Enforcement in the main process

The UI hiding a feature is not the boundary - the main process is. Feature-owned
IPC handlers are registered with `handleFeatureIpc`:

```ts
handleFeatureIpc('vms', 'local-vms:start', async (_, vmName: string) => { ... });
```

If the mode has that feature off, the call rejects with
`Feature "vms" is disabled in "training" mode.` The current channel ownership:

| Feature     | Channels          |
| ----------- | ----------------- |
| `tools`     | `tools:*`         |
| `vms`       | `local-vms:*`     |
| `remoteVms` | `remote-vms:*`    |
| `webApps`   | `webapps:*`       |
| `rules`     | `rules:*`         |
| `api`       | `api:*`           |

`mode:get` and `mode:reload` are always available.

`devTools` is enforced separately: the menu item uses a native Electron role, so
it is hidden and disabled (accelerator included) when the mode says so, and the
React devtools extension is not installed. A development build always keeps
devtools - only packaged builds obey the flag (`isDevToolsAllowed()`).

## Adding a feature

1. Add the id to `FEATURES` in `src/modes/features.ts`.
2. Give it a default in `config/modes.yaml` (`defaults:`) and override it in the
   modes that differ. Mirror it in `BUILT_IN_MODES` in `features.ts`.
3. Gate the UI with `<Feature name='...'>`, `useFeature('...')` or
   `FeatureRoute`, and the IPC handlers with `handleFeatureIpc('...', ...)`.
4. `node tests/test-app-mode.mjs` checks the catalog still resolves.

## Operating it

```bash
# what mode is this machine in?
cat /etc/libvirt-ui/mode

# put it into maintenance (takes effect within ~5s, no restart)
echo maintenance | sudo tee /etc/libvirt-ui/mode

# try a mode without touching the machine's state
LIBVIRT_UI_MODE=training pnpm dev
```
