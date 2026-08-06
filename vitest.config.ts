import { defineConfig } from 'vitest/config';

import viteTsconfigPaths from 'vite-tsconfig-paths';

import { productName, version } from './package.json';

// Mirror the compile-time constants injected by config/vite.*.config.ts so
// application modules can be imported unchanged under Vitest.
const define = {
  __DARWIN__: process.platform === 'darwin',
  __WIN32__: process.platform === 'win32',
  __LINUX__: process.platform === 'linux',
  __APP_NAME__: JSON.stringify(productName),
  __APP_VERSION__: JSON.stringify(version),
  __DEV__: false
};

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/@types/**',
        'src/main.ts',
        'src/preload.ts'
      ],
      reporter: [
        'text',
        'html',
        'lcov'
      ]
    },
    projects: [
      {
        plugins: [viteTsconfigPaths()],
        define,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/unit/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/renderer.setup.ts']
        }
      }
    ]
  }
});
