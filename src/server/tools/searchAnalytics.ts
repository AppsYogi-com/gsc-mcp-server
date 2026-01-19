import { GSCClient } from '../../gsc/client.js';
import { SearchAnalyticsQuerySchema, type ToolResult } from '../../types.js';

export const searchAnalyticsTools = [
    {
        name: 'searchanalytics.query',
        description: `Query Google Search Console search analytics data.
    
Returns clicks, impressions, CTR, and position data grouped by dimensions.
Supports filtering by query, page, country, device, and search appearance.

Common use cases:
- Get top performing queries for a site
- Analyze page performance
- Compare traffic across devices or countries
- Filter by specific queries or URL patterns`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to query, e.g., "https://example.com" or "sc-domain:example.com"',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date in YYYY-MM-DD format',
                },
                endDate: {
                    type: 'string',
                    description: 'End date in YYYY-MM-DD format',
                },
                dimensions: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['query', 'page', 'country', 'device', 'searchAppearance', 'date'],
                    },
                    description: 'Dimensions to group by. Common: ["query"], ["page"], ["query", "page"]',
                },
                dimensionFilterGroups: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            groupType: { type: 'string', enum: ['and', 'or'] },
                            filters: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        dimension: { type: 'string', enum: ['query', 'page', 'country', 'device', 'searchAppearance'] },
                                        operator: { type: 'string', enum: ['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex'] },
                                        expression: { type: 'string' },
                                    },
                                    required: ['dimension', 'operator', 'expression'],
                                },
                            },
                        },
                    },
                    description: 'Filters to apply. Example: filter pages containing "/blog/"',
                },
                rowLimit: {
                    type: 'number',
                    description: 'Maximum rows to return (default: 1000, max: 25000)',
                    default: 1000,
                },
                startRow: {
                    type: 'number',
                    description: 'Starting row for pagination (default: 0)',
                    default: 0,
                },
                dataState: {
                    type: 'string',
                    enum: ['all', 'final'],
                    description: '"all" includes fresh data (default), "final" only finalized data',
                    default: 'all',
                },
                aggregationType: {
                    type: 'string',
                    enum: ['auto', 'byPage', 'byProperty'],
                    description: 'How to aggregate results',
                },
            },
            required: ['siteUrl', 'startDate', 'endDate'],
        },
    },
    {
        name: 'report.comparePeriods',
        description: `Compare search analytics data between two time periods.
    
Useful for:
- Week-over-week comparisons
- Month-over-month trends
- Before/after analysis for SEO changes`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to query',
                },
                period1: {
                    type: 'object',
                    properties: {
                        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                    },
                    required: ['startDate', 'endDate'],
                    description: 'First (usually current) period',
                },
                period2: {
                    type: 'object',
                    properties: {
                        startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                        endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' },
                    },
                    required: ['startDate', 'endDate'],
                    description: 'Second (usually previous) period for comparison',
                },
                dimensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Dimensions to group by',
                },
                rowLimit: {
                    type: 'number',
                    description: 'Maximum rows per period (default: 100)',
                    default: 100,
                },
            },
            required: ['siteUrl', 'period1', 'period2'],
        },
    },
];

export async function handleSearchAnalyticsTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    const client = await GSCClient.create();

    if (name === 'searchanalytics.query') {
        const query = SearchAnalyticsQuerySchema.parse(args);
        const response = await client.searchAnalytics(query);

        // Format response nicely
        const summary = {
            rowCount: response.rows?.length || 0,
            aggregationType: response.responseAggregationType,
        };

        // Calculate totals
        const totals = response.rows?.reduce(
            (acc, row) => ({
                clicks: acc.clicks + row.clicks,
                impressions: acc.impressions + row.impressions,
            }),
            { clicks: 0, impressions: 0 }
        );

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            summary,
                            totals,
                            rows: response.rows,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    if (name === 'report.comparePeriods') {
        const { siteUrl, period1, period2, dimensions, rowLimit = 100 } = args as {
            siteUrl: string;
            period1: { startDate: string; endDate: string };
            period2: { startDate: string; endDate: string };
            dimensions?: string[];
            rowLimit?: number;
        };

        // Query both periods
        const [result1, result2] = await Promise.all([
            client.searchAnalytics({
                siteUrl,
                startDate: period1.startDate,
                endDate: period1.endDate,
                dimensions: dimensions as ('query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date')[],
                rowLimit,
            }),
            client.searchAnalytics({
                siteUrl,
                startDate: period2.startDate,
                endDate: period2.endDate,
                dimensions: dimensions as ('query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date')[],
                rowLimit,
            }),
        ]);

        // Calculate totals for each period
        const totals1 = result1.rows?.reduce<{ clicks: number; impressions: number; ctr: number; position: number; count: number }>(
            (acc, row) => ({
                clicks: acc.clicks + row.clicks,
                impressions: acc.impressions + row.impressions,
                ctr: 0,
                position: acc.position + row.position,
                count: acc.count + 1,
            }),
            { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 }
        );

        const totals2 = result2.rows?.reduce<{ clicks: number; impressions: number; ctr: number; position: number; count: number }>(
            (acc, row) => ({
                clicks: acc.clicks + row.clicks,
                impressions: acc.impressions + row.impressions,
                ctr: 0,
                position: acc.position + row.position,
                count: acc.count + 1,
            }),
            { clicks: 0, impressions: 0, ctr: 0, position: 0, count: 0 }
        );

        // Calculate changes
        const changes = totals1 && totals2 ? {
            clicks: totals1.clicks - totals2.clicks,
            clicksPercent: totals2.clicks ? ((totals1.clicks - totals2.clicks) / totals2.clicks * 100).toFixed(1) + '%' : 'N/A',
            impressions: totals1.impressions - totals2.impressions,
            impressionsPercent: totals2.impressions ? ((totals1.impressions - totals2.impressions) / totals2.impressions * 100).toFixed(1) + '%' : 'N/A',
            avgPosition: totals1.count && totals2.count
                ? (totals1.position / totals1.count - totals2.position / totals2.count).toFixed(2)
                : 'N/A',
        } : null;

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            comparison: {
                                period1: {
                                    dates: period1,
                                    totals: totals1 ? {
                                        clicks: totals1.clicks,
                                        impressions: totals1.impressions,
                                        avgPosition: totals1.count ? (totals1.position / totals1.count).toFixed(2) : 0,
                                    } : null,
                                    rowCount: result1.rows?.length || 0,
                                },
                                period2: {
                                    dates: period2,
                                    totals: totals2 ? {
                                        clicks: totals2.clicks,
                                        impressions: totals2.impressions,
                                        avgPosition: totals2.count ? (totals2.position / totals2.count).toFixed(2) : 0,
                                    } : null,
                                    rowCount: result2.rows?.length || 0,
                                },
                                changes,
                            },
                            period1Data: result1.rows,
                            period2Data: result2.rows,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    return {
        content: [{ type: 'text', text: `Unknown search analytics tool: ${name}` }],
        isError: true,
    };
}
