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

type ResourceClient = Pick<GSCClient, 'listSites' | 'listSitemaps'>;

const SITES_URI = 'gsc://sites';
const SITEMAPS_SUFFIX = '/sitemaps';

export type ParsedResourceUri =
    | { kind: 'sites' }
    | { kind: 'sitemaps'; siteUrl: string };

/**
 * Parse a gsc:// resource URI by string prefix. `new URL('gsc://sites')` would put "sites" in the
 * host, so URL parsing can't be used here.
 *
 * - `gsc://sites`
 * - `gsc://sites/{encodeURIComponent(siteUrl)}/sitemaps` (an unencoded siteUrl is accepted too)
 */
export function parseResourceUri(uri: string): ParsedResourceUri | null {
    if (uri === SITES_URI || uri === `${SITES_URI}/`) {
        return { kind: 'sites' };
    }
    if (uri.startsWith(`${SITES_URI}/`) && uri.endsWith(SITEMAPS_SUFFIX)) {
        const encoded = uri.slice(SITES_URI.length + 1, -SITEMAPS_SUFFIX.length);
        if (!encoded) return null;
        let siteUrl: string;
        try {
            siteUrl = decodeURIComponent(encoded);
        } catch {
            return null;
        }
        return { kind: 'sitemaps', siteUrl };
    }
    return null;
}

/**
 * Get all available resources
 */
export async function getAllResources(
    createClient: () => Promise<ResourceClient> = () => GSCClient.create()
): Promise<Resource[]> {
    const resources: Resource[] = [
        {
            uri: SITES_URI,
            name: 'GSC Sites',
            description: 'List all Google Search Console properties you have access to',
            mimeType: 'application/json',
        },
    ];

    // Try to add dynamic resources for each site
    try {
        const client = await createClient();
        const sites = await client.listSites();

        for (const site of sites) {
            const encodedUrl = encodeURIComponent(site.siteUrl);
            resources.push({
                uri: `${SITES_URI}/${encodedUrl}${SITEMAPS_SUFFIX}`,
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
export async function handleResourceRead(
    uri: string,
    createClient: () => Promise<ResourceClient> = () => GSCClient.create()
): Promise<ResourceContent> {
    const parsed = parseResourceUri(uri);
    if (!parsed) {
        throw new Error(`Unknown resource: ${uri}`);
    }

    const client = await createClient();
    const data = parsed.kind === 'sites'
        ? await client.listSites()
        : await client.listSitemaps(parsed.siteUrl);

    return {
        contents: [
            {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(data, null, 2),
            },
        ],
    };
}
