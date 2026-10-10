import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': src, 'server-only': `${src}/lib/__tests__/empty.ts` } },
  test: { include: ['src/**/*.test.ts'] },
});
