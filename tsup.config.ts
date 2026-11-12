import { readFileSync } from 'fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
    // Single source of truth for the version reported by the CLI and MCP server
    define: {
        __PKG_VERSION__: JSON.stringify(pkg.version),
    },
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
