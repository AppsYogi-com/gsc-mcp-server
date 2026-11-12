/**
 * Smoke test of the built package: the CLI over stdio, like an MCP client would run it, with no
 * credentials (empty HOME). Run `npm run build` first.
 */

import { existsSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dist = join(process.cwd(), 'dist');
const cli = join(dist, 'cli', 'index.js');
const home = mkdtempSync(join(tmpdir(), 'gsc-mcp-smoke-'));
let client: Client;

beforeAll(async () => {
    const env: Record<string, string> = {
        PATH: process.env.PATH ?? '',
        HOME: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        XDG_DATA_HOME: join(home, '.local', 'share'),
        APPDATA: join(home, 'AppData'),
        LOCALAPPDATA: join(home, 'AppData', 'Local'),
    };
    client = new Client({ name: 'smoke', version: '0.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, 'run'], env, stderr: 'pipe' }));
});

afterAll(async () => {
    await client?.close();
});

describe('built package', () => {
    it('ships type declarations for the library entry', () => {
        expect(existsSync(join(dist, 'index.d.ts'))).toBe(true);
    });

    it('reports its name and version, and lists the 13 tools without credentials', async () => {
        const info = client.getServerVersion();
        expect(info?.name).toBe('gsc-mcp');
        expect(info?.version).toMatch(/^\d+\.\d+\.\d+/);
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(13);
        expect(tools.map((t) => t.name)).toContain('searchanalytics.query');
    });

    it('lists the gsc://sites resource', async () => {
        const { resources } = await client.listResources();
        expect(resources.map((r) => r.uri)).toContain('gsc://sites');
    });

    it('recognizes gsc://sites (it only fails for lack of credentials)', async () => {
        const read = client.readResource({ uri: 'gsc://sites' });
        await expect(read).rejects.toThrow();
        await expect(read).rejects.not.toThrow(/Unknown resource/);
    });

    it('rejects unknown resources', async () => {
        await expect(client.readResource({ uri: 'gsc://nope' })).rejects.toThrow(/Unknown resource/);
    });

    it('returns a tool error when a tool needs Google', async () => {
        const result = (await client.callTool({
            name: 'searchanalytics.query',
            arguments: { siteUrl: 'sc-domain:example.com', startDate: '2026-11-01', endDate: '2026-11-07' },
        })) as { content: { text: string }[]; isError?: boolean };
        expect(result.isError).toBe(true);
    });
});
