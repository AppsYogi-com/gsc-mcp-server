import { GSCClient } from '../../gsc/client.js';
import { SearchAnalyticsQuerySchema, type ToolResult, type SearchAnalyticsRow } from '../../types.js';
import {
    formatRows,
    formatPosition,
    generateSummary,
    DEFAULT_ROW_LIMIT,
    type FormatOptions,
} from './formatters.js';

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
- Filter by specific queries or URL patterns

LLM optimization options:
- format: "compact" for token-efficient responses with short keys
- granularity: "weekly" or "monthly" for date dimension rollups`,
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
                    description: `Maximum rows to return (default: ${DEFAULT_ROW_LIMIT}, max: 25000). Lower values recommended for LLM use.`,
                    default: DEFAULT_ROW_LIMIT,
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
                format: {
                    type: 'string',
                    enum: ['full', 'compact'],
                    description: 'Response format: "full" (default) or "compact" (LLM-optimized with short keys, % CTR)',
                    default: 'full',
                },
                granularity: {
                    type: 'string',
                    enum: ['daily', 'weekly', 'monthly', 'auto'],
                    description: 'For date dimension: rollup granularity. "auto" picks based on date range.',
                    default: 'daily',
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
                    description: `Maximum rows per period (default: ${DEFAULT_ROW_LIMIT})`,
                    default: DEFAULT_ROW_LIMIT,
                },
                format: {
                    type: 'string',
                    enum: ['full', 'compact'],
                    description: 'Response format: "full" (default) or "compact" (LLM-optimized)',
                    default: 'full',
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
        const format = (args.format as 'full' | 'compact') || 'full';
        const granularity = (args.granularity as 'daily' | 'weekly' | 'monthly' | 'auto') || 'daily';
        const siteUrl = args.siteUrl as string;
        const dimensions = args.dimensions as string[] | undefined;
        
        // Apply default rowLimit (issue #4)
        const rowLimit = (args.rowLimit as number) || DEFAULT_ROW_LIMIT;
        
        const query = SearchAnalyticsQuerySchema.parse({ ...args, rowLimit });
        let response = await client.searchAnalytics(query);

        // Apply date rollup if needed (issue #3)
        if (dimensions?.includes('date') && granularity !== 'daily' && response.rows) {
            response = {
                ...response,
                rows: rollupByGranularity(response.rows, granularity, args.startDate as string, args.endDate as string),
            };
        }

        const formatOptions: FormatOptions = { format, siteUrl };

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

        // Format rows with truncated precision (issue #1) and stripped URLs (issue #2)
        const formattedRows = formatRows(response.rows, formatOptions);

        // Build response based on format (issue #5)
        if (format === 'compact') {
            const compactResponse: Record<string, unknown> = {
                summary: generateSummary(response.rows, dimensions),
                total: totals,
                rows: formattedRows,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(compactResponse, null, 2) }],
            };
        }

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ summary, totals, rows: formattedRows }, null, 2),
                },
            ],
        };
    }

    if (name === 'report.comparePeriods') {
        const { siteUrl, period1, period2, dimensions, rowLimit = DEFAULT_ROW_LIMIT, format = 'full' } = args as {
            siteUrl: string;
            period1: { startDate: string; endDate: string };
            period2: { startDate: string; endDate: string };
            dimensions?: string[];
            rowLimit?: number;
            format?: 'full' | 'compact';
        };

        const formatOptions: FormatOptions = { format, siteUrl };

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
                ? formatPosition(totals1.position / totals1.count - totals2.position / totals2.count)
                : 'N/A',
        } : null;

        // Format rows with truncated precision
        const period1Data = formatRows(result1.rows, formatOptions);
        const period2Data = formatRows(result2.rows, formatOptions);

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
                                        avgPosition: totals1.count ? formatPosition(totals1.position / totals1.count) : 0,
                                    } : null,
                                    rowCount: result1.rows?.length || 0,
                                },
                                period2: {
                                    dates: period2,
                                    totals: totals2 ? {
                                        clicks: totals2.clicks,
                                        impressions: totals2.impressions,
                                        avgPosition: totals2.count ? formatPosition(totals2.position / totals2.count) : 0,
                                    } : null,
                                    rowCount: result2.rows?.length || 0,
                                },
                                changes,
                            },
                            period1Data,
                            period2Data,
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

/**
 * Roll up daily data into weekly or monthly buckets (issue #3)
 */
function rollupByGranularity(
    rows: SearchAnalyticsRow[],
    granularity: 'weekly' | 'monthly' | 'auto',
    startDate: string,
    endDate: string
): SearchAnalyticsRow[] {
    // Determine actual granularity for 'auto'
    let actualGranularity = granularity;
    if (granularity === 'auto') {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 90) {
            actualGranularity = 'monthly';
        } else if (days > 21) {
            actualGranularity = 'weekly';
        } else {
            return rows; // Keep daily for short ranges
        }
    }

    // Group rows by bucket
    const buckets = new Map<string, { clicks: number; impressions: number; positions: number[]; dates: string[] }>();

    for (const row of rows) {
        const dateStr = row.keys?.[0];
        if (!dateStr) continue;

        const date = new Date(dateStr);
        let bucketKey: string;

        if (actualGranularity === 'monthly') {
            bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
            // Weekly: use the Monday of the week
            const monday = new Date(date);
            monday.setDate(date.getDate() - date.getDay() + 1);
            bucketKey = monday.toISOString().split('T')[0];
        }

        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, { clicks: 0, impressions: 0, positions: [], dates: [] });
        }

        const bucket = buckets.get(bucketKey)!;
        bucket.clicks += row.clicks;
        bucket.impressions += row.impressions;
        bucket.positions.push(row.position);
        bucket.dates.push(dateStr);
    }

    // Convert buckets back to rows
    const rolledUpRows: SearchAnalyticsRow[] = [];
    for (const [bucketKey, bucket] of buckets) {
        const avgPosition = bucket.positions.length > 0
            ? bucket.positions.reduce((a, b) => a + b, 0) / bucket.positions.length
            : 0;
        
        rolledUpRows.push({
            keys: [bucketKey],
            clicks: bucket.clicks,
            impressions: bucket.impressions,
            ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
            position: avgPosition,
        });
    }

    // Sort by date
    rolledUpRows.sort((a, b) => (a.keys?.[0] || '').localeCompare(b.keys?.[0] || ''));

    return rolledUpRows;
}
