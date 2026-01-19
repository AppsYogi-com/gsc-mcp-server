import { GSCClient } from '../../gsc/client.js';

interface Resource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

interface ResourceContent {
    contents: Array<{
        uri: string;
        mimeType: string;
        text: string;
    }>;
}

/**
 * Get all available resources
 */
export async function getAllResources(): Promise<Resource[]> {
    const resources: Resource[] = [
        {
            uri: 'gsc://sites',
            name: 'GSC Sites',
            description: 'List all Google Search Console properties you have access to',
            mimeType: 'application/json',
        },
    ];

    // Try to add dynamic resources for each site
    try {
        const client = await GSCClient.create();
        const sites = await client.listSites();

        for (const site of sites) {
            const encodedUrl = encodeURIComponent(site.siteUrl);
            resources.push({
                uri: `gsc://sites/${encodedUrl}/sitemaps`,
                name: `Sitemaps for ${site.siteUrl}`,
                description: `List sitemaps for ${site.siteUrl}`,
                mimeType: 'application/json',
            });
        }
    } catch {
        // If we can't list sites, just return the base resources
    }

    return resources;
}

/**
 * Handle resource read requests
 */
export async function handleResourceRead(uri: string): Promise<ResourceContent> {
    const client = await GSCClient.create();

    // Parse the URI
    const parsed = new URL(uri);

    if (parsed.protocol !== 'gsc:') {
        throw new Error(`Unknown resource protocol: ${parsed.protocol}`);
    }

    const path = parsed.pathname.replace(/^\/\//, '');
    const parts = path.split('/').filter(Boolean);

    // gsc://sites
    if (parts.length === 1 && parts[0] === 'sites') {
        const sites = await client.listSites();
        return {
            contents: [
                {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(sites, null, 2),
                },
            ],
        };
    }

    // gsc://sites/{siteUrl}/sitemaps
    if (parts.length === 3 && parts[0] === 'sites' && parts[2] === 'sitemaps') {
        const siteUrl = decodeURIComponent(parts[1]);
        const sitemaps = await client.listSitemaps(siteUrl);
        return {
            contents: [
                {
                    uri,
                    mimeType: 'application/json',
                    text: JSON.stringify(sitemaps, null, 2),
                },
            ],
        };
    }

    throw new Error(`Unknown resource: ${uri}`);
}
