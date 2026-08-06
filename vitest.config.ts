import path from 'node:path';

import viteTsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

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
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/unit/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/app-defines.setup.ts', 'tests/setup/renderer.setup.ts']
        }
      },
      {
        plugins: [viteTsconfigPaths()],
        resolve: {
          alias: {
            // The real electron module only works inside an Electron runtime;
            // main-process units get this hand-rolled stand-in instead.
            electron: path.resolve(import.meta.dirname, 'tests/mocks/electron.ts')
          }
        },
        test: {
          name: 'main',
          environment: 'node',
          include: ['tests/unit/main/**/*.test.ts'],
          setupFiles: ['tests/setup/app-defines.setup.ts']
        }
      }
    ]
  }
});
