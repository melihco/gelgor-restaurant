import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TIER1_COVERAGE_GLOBS } from './src/lib/tier1-coverage-modules';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Next.js tsconfig uses `jsx: preserve`; the React plugin transforms any
  // transitively-imported .tsx in the dependency graph so pure-logic unit tests
  // (which only call functions) can still resolve their import chain.
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: [...TIER1_COVERAGE_GLOBS],
      exclude: ['src/**/__tests__/**'],
      thresholds: {
        lines: 55,
        functions: 50,
        branches: 45,
        statements: 55,
      },
    },
  },
});
