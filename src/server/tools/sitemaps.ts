import { GSCClient } from '../../gsc/client.js';
import { hasScope, getScopeUpgradeMessage } from '../../auth/oauth.js';
import type { ToolResult } from '../../types.js';

export const sitemapTools = [
    {
        name: 'sitemaps.list',
        description: `List all sitemaps for a site.
    
Returns sitemap URLs, submission dates, status, and error counts.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to query',
                },
            },
            required: ['siteUrl'],
        },
    },
    {
        name: 'sitemaps.get',
        description: 'Get details for a specific sitemap',
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property)',
                },
                feedpath: {
                    type: 'string',
                    description: 'Full URL of the sitemap',
                },
            },
            required: ['siteUrl', 'feedpath'],
        },
    },
    {
        name: 'sitemaps.submit',
        description: `Submit a sitemap for indexing.
    
⚠️ Requires "full" scope. Run \`gsc-mcp init --scope full\` to enable.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property)',
                },
                feedpath: {
                    type: 'string',
                    description: 'Full URL of the sitemap to submit',
                },
            },
            required: ['siteUrl', 'feedpath'],
        },
    },
    {
        name: 'sitemaps.delete',
        description: `Delete a sitemap from GSC (does not delete the actual file).
    
⚠️ Requires "full" scope. Run \`gsc-mcp init --scope full\` to enable.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property)',
                },
                feedpath: {
                    type: 'string',
                    description: 'Full URL of the sitemap to delete',
                },
            },
            required: ['siteUrl', 'feedpath'],
        },
    },
];

export async function handleSitemapTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    const client = await GSCClient.create();
    const siteUrl = args.siteUrl as string;

    if (name === 'sitemaps.list') {
        const sitemaps = await client.listSitemaps(siteUrl);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            siteUrl,
                            sitemapCount: sitemaps.length,
                            sitemaps,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    if (name === 'sitemaps.get') {
        const feedpath = args.feedpath as string;
        const sitemap = await client.getSitemap(siteUrl, feedpath);

        if (!sitemap) {
            return {
                content: [{ type: 'text', text: `Sitemap not found: ${feedpath}` }],
                isError: true,
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(sitemap, null, 2),
                },
            ],
        };
    }

    if (name === 'sitemaps.submit') {
        // Check scope
        if (!(await hasScope('full'))) {
            return {
                content: [{ type: 'text', text: getScopeUpgradeMessage('sitemaps.submit') }],
                isError: true,
            };
        }

        const feedpath = args.feedpath as string;
        await client.submitSitemap(siteUrl, feedpath);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            success: true,
                            message: `Sitemap submitted: ${feedpath}`,
                            siteUrl,
                            feedpath,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    if (name === 'sitemaps.delete') {
        // Check scope
        if (!(await hasScope('full'))) {
            return {
                content: [{ type: 'text', text: getScopeUpgradeMessage('sitemaps.delete') }],
                isError: true,
            };
        }

        const feedpath = args.feedpath as string;
        await client.deleteSitemap(siteUrl, feedpath);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            success: true,
                            message: `Sitemap deleted from GSC: ${feedpath}`,
                            siteUrl,
                            feedpath,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    return {
        content: [{ type: 'text', text: `Unknown sitemap tool: ${name}` }],
        isError: true,
    };
}
