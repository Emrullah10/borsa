import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['core/**/*.test.js', 'services/**/*.test.js', 'packages/**/*.test.js'],
    exclude: ['**/node_modules/**', 'web-app/**'],
  },
});
