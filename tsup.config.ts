import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        'index': 'src/index.ts',
        'cli/index': 'src/cli/index.ts',
    },
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    target: 'node18',
    outDir: 'dist',
    // Don't bundle dependencies - let Node resolve them at runtime
    external: [
        'googleapis',
        'google-auth-library',
        'better-sqlite3',
        'keytar',
        '@modelcontextprotocol/sdk',
    ],
});
