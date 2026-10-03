import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@football-clip-recorder/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@football-clip-recorder/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@football-clip-recorder/video': path.resolve(__dirname, 'packages/video/src/index.ts'),
      '@football-clip-recorder/camera': path.resolve(__dirname, 'packages/camera/src/index.ts'),
      '@football-clip-recorder/hardware': path.resolve(__dirname, 'packages/hardware/src/index.ts'),
      '@football-clip-recorder/storage': path.resolve(__dirname, 'packages/storage/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
