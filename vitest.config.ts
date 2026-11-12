import { defineConfig } from 'vitest/config';

export default defineConfig({
    define: { __PKG_VERSION__: JSON.stringify('0.0.0-test') },
    test: {
        include: ['test/unit/**/*.test.ts', 'test/tools/**/*.test.ts'],
    },
});
