import { productName, version } from '../../package.json';

/**
 * The Forge Vite configs statically replace these compile-time constants
 * (see config/vite.renderer.config.ts). Vitest's SSR transform does not apply
 * `define` replacements, so provide them as runtime globals instead — the
 * application code reads them as free identifiers, which resolve to
 * globalThis properties here.
 */
Object.assign(globalThis, {
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __LINUX__: process.platform === 'linux',
  __APP_NAME__: productName,
  __APP_VERSION__: version,
  __DEV__: false
});
