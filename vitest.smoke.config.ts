import { defineConfig } from 'vitest/config';

// Runs against the built CLI in dist/ (run `npm run build` first)
export default defineConfig({
    test: {
        include: ['test/smoke/**/*.test.ts'],
        testTimeout: 30000,
    },
});
