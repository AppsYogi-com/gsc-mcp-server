import { GSCClient } from '../../gsc/client.js';
import { hasScope, getScopeUpgradeMessage } from '../../auth/oauth.js';
import type { ToolResult } from '../../types.js';

export const urlInspectionTools = [
    {
        name: 'urlInspection.inspect',
        description: `Inspect a URL to check its indexing status.
    
Returns:
- Index status (indexed, not indexed, etc.)
- Crawl status and last crawl time
- Mobile usability issues
- Rich results status
- Canonical URL information

⚠️ Requires "full" scope. Run \`gsc-mcp init --scope full\` to enable.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property)',
                },
                inspectionUrl: {
                    type: 'string',
                    description: 'The full URL to inspect',
                },
            },
            required: ['siteUrl', 'inspectionUrl'],
        },
    },
    {
        name: 'urlInspection.batchInspect',
        description: `Inspect multiple URLs at once.
    
Inspects up to 10 URLs in parallel and returns combined results.

⚠️ Requires "full" scope. Run \`gsc-mcp init --scope full\` to enable.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property)',
                },
                urls: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of URLs to inspect (max 10)',
                    maxItems: 10,
                },
            },
            required: ['siteUrl', 'urls'],
        },
    },
];

export async function handleUrlInspectionTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    // Check scope for all URL inspection tools
    if (!(await hasScope('full'))) {
        return {
            content: [{ type: 'text', text: getScopeUpgradeMessage(name) }],
            isError: true,
        };
    }

    const client = await GSCClient.create();
    const siteUrl = args.siteUrl as string;

    if (name === 'urlInspection.inspect') {
        const inspectionUrl = args.inspectionUrl as string;
        const result = await client.inspectUrl(siteUrl, inspectionUrl);

        // Format the result for readability
        const formatted = formatInspectionResult(result, inspectionUrl);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(formatted, null, 2),
                },
            ],
        };
    }

    if (name === 'urlInspection.batchInspect') {
        const urls = args.urls as string[];

        if (urls.length > 10) {
            return {
                content: [{ type: 'text', text: 'Maximum 10 URLs allowed per batch inspection' }],
                isError: true,
            };
        }

        // Inspect all URLs in parallel
        const results = await Promise.allSettled(
            urls.map((url) => client.inspectUrl(siteUrl, url))
        );

        const formatted = results.map((result, index) => {
            const url = urls[index];
            if (result.status === 'fulfilled') {
                return formatInspectionResult(result.value, url);
            } else {
                return {
                    url,
                    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                };
            }
        });

        // Summary
        const indexed = formatted.filter(
            (r) => 'indexStatus' in r && r.indexStatus?.verdict === 'PASS'
        ).length;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            summary: {
                                total: urls.length,
                                indexed,
                                notIndexed: urls.length - indexed,
                            },
                            results: formatted,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    return {
        content: [{ type: 'text', text: `Unknown URL inspection tool: ${name}` }],
        isError: true,
    };
}

interface InspectionResult {
    inspectionResult?: {
        indexStatusResult?: {
            verdict?: string;
            coverageState?: string;
            robotsTxtState?: string;
            indexingState?: string;
            lastCrawlTime?: string;
            pageFetchState?: string;
            googleCanonical?: string;
            userCanonical?: string;
            crawledAs?: string;
        };
        mobileUsabilityResult?: {
            verdict?: string;
            issues?: Array<{
                issueType?: string;
                severity?: string;
                message?: string;
            }>;
        };
        richResultsResult?: {
            verdict?: string;
            detectedItems?: Array<{
                richResultType?: string;
            }>;
        };
    };
}

function formatInspectionResult(result: InspectionResult, url: string) {
    const ir = result.inspectionResult;

    return {
        url,
        indexStatus: ir?.indexStatusResult
            ? {
                verdict: ir.indexStatusResult.verdict,
                coverageState: ir.indexStatusResult.coverageState,
                indexingState: ir.indexStatusResult.indexingState,
                lastCrawlTime: ir.indexStatusResult.lastCrawlTime,
                crawledAs: ir.indexStatusResult.crawledAs,
                robotsTxtState: ir.indexStatusResult.robotsTxtState,
                pageFetchState: ir.indexStatusResult.pageFetchState,
            }
            : null,
        canonical: ir?.indexStatusResult
            ? {
                google: ir.indexStatusResult.googleCanonical,
                user: ir.indexStatusResult.userCanonical,
                match:
                    ir.indexStatusResult.googleCanonical === ir.indexStatusResult.userCanonical,
            }
            : null,
        mobileUsability: ir?.mobileUsabilityResult
            ? {
                verdict: ir.mobileUsabilityResult.verdict,
                issues: ir.mobileUsabilityResult.issues || [],
            }
            : null,
        richResults: ir?.richResultsResult
            ? {
                verdict: ir.richResultsResult.verdict,
                detectedTypes:
                    ir.richResultsResult.detectedItems?.map((i) => i.richResultType) || [],
            }
            : null,
    };
}
