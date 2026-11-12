import { GSCClient } from '../../gsc/client.js';
import { SearchAnalyticsQuerySchema, type ToolResult, type SearchAnalyticsRow } from '../../types.js';
import {
    formatRows,
    formatCtr,
    formatPosition,
    generateSummary,
    DEFAULT_ROW_LIMIT,
    type FormatOptions,
} from './formatters.js';
import { resolveGranularity, rollupByGranularity, type Granularity } from './rollup.js';

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

Page rows include url_key (host + path, e.g. "example.com/blog/post"), the join key shared with
the GA4 and AdSense MCP servers. "full" format keeps exact page URLs; "compact" shortens them to paths.

LLM optimization options:
- format: "compact" for token-efficient responses with short keys
- granularity: "weekly" (ISO weeks, Monday start) or "monthly" for date dimension rollups`,
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
- Before/after analysis for SEO changes

Totals are the property's totals for each period (all rows, impression-weighted position),
not sums of the returned rows. Page rows include url_key.`,
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

type Dimension = 'query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date';

/** Search Console's maximum rows per request. */
const MAX_ROWS_PER_REQUEST = 25000;

export interface PeriodTotals {
    clicks: number;
    impressions: number;
    ctr: number;
    /** Impression-weighted average position; null when the period has no impressions. */
    position: number | null;
}

/**
 * Property totals for a date range: a query with no dimensions, so Search Console aggregates
 * every row itself (CTR and impression-weighted position included), not just the top N.
 */
export async function fetchPeriodTotals(
    client: Pick<GSCClient, 'searchAnalytics'>,
    siteUrl: string,
    period: { startDate: string; endDate: string }
): Promise<PeriodTotals> {
    const response = await client.searchAnalytics({
        siteUrl,
        startDate: period.startDate,
        endDate: period.endDate,
        rowLimit: 1,
    });
    return totalsFromRow(response.rows?.[0]);
}

function totalsFromRow(row: SearchAnalyticsRow | undefined): PeriodTotals {
    if (!row) return { clicks: 0, impressions: 0, ctr: 0, position: null };
    return {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.impressions > 0 ? row.position : null,
    };
}

const percentChange = (current: number, previous: number) =>
    previous ? ((current - previous) / previous * 100).toFixed(1) + '%' : 'N/A';

export async function handleSearchAnalyticsTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    const client = await GSCClient.create();

    if (name === 'searchanalytics.query') {
        const format = (args.format as 'full' | 'compact') || 'full';
        const granularity = (args.granularity as Granularity) || 'daily';
        const siteUrl = args.siteUrl as string;
        const dimensions = args.dimensions as string[] | undefined;

        // Apply default rowLimit (issue #4)
        const rowLimit = (args.rowLimit as number) || DEFAULT_ROW_LIMIT;

        const query = SearchAnalyticsQuerySchema.parse({ ...args, rowLimit });
        const rollup = dimensions?.includes('date')
            ? resolveGranularity(granularity, query.startDate, query.endDate)
            : 'daily';

        let response;
        if (rollup === 'daily') {
            response = await client.searchAnalytics(query);
        } else {
            // Apply date rollup (issue #3): roll up all daily rows, then apply startRow/rowLimit
            // to the buckets, so a weekly or monthly series covers the whole range.
            const startRow = query.startRow ?? 0;
            const daily = await client.searchAnalytics({ ...query, rowLimit: MAX_ROWS_PER_REQUEST, startRow: 0 });
            response = {
                ...daily,
                rows: rollupByGranularity(daily.rows ?? [], rollup, dimensions).slice(startRow, startRow + rowLimit),
            };
        }

        const formatOptions: FormatOptions = { format, siteUrl, dimensions };

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

        // Format rows with truncated precision (issue #1) and url_key for page rows
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
            dimensions?: Dimension[];
            rowLimit?: number;
            format?: 'full' | 'compact';
        };
        const compact = format === 'compact';
        const formatOptions: FormatOptions = { format, siteUrl, dimensions };

        const queryRows = (period: { startDate: string; endDate: string }) =>
            client.searchAnalytics({
                siteUrl,
                startDate: period.startDate,
                endDate: period.endDate,
                dimensions,
                rowLimit,
            });

        // Totals come from a no-dimension query per period (all rows, impression-weighted
        // position), never from summing the top-N rows below.
        const hasDimensions = Boolean(dimensions?.length);
        const [totals1, totals2, result1, result2] = await Promise.all([
            fetchPeriodTotals(client, siteUrl, period1),
            fetchPeriodTotals(client, siteUrl, period2),
            hasDimensions ? queryRows(period1) : undefined,
            hasDimensions ? queryRows(period2) : undefined,
        ]);

        const changes = {
            clicks: totals1.clicks - totals2.clicks,
            clicksPercent: percentChange(totals1.clicks, totals2.clicks),
            impressions: totals1.impressions - totals2.impressions,
            impressionsPercent: percentChange(totals1.impressions, totals2.impressions),
            avgPosition: totals1.position !== null && totals2.position !== null
                ? formatPosition(totals1.position - totals2.position)
                : 'N/A',
        };

        const describeTotals = (totals: PeriodTotals) => ({
            clicks: totals.clicks,
            impressions: totals.impressions,
            ctr: formatCtr(totals.ctr, compact),
            avgPosition: totals.position === null ? null : formatPosition(totals.position),
        });

        // Format rows with truncated precision and url_key for page rows
        const period1Data = formatRows(result1?.rows, formatOptions);
        const period2Data = formatRows(result2?.rows, formatOptions);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            comparison: {
                                period1: {
                                    dates: period1,
                                    totals: describeTotals(totals1),
                                    rowCount: period1Data.length,
                                },
                                period2: {
                                    dates: period2,
                                    totals: describeTotals(totals2),
                                    rowCount: period2Data.length,
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
