import { GSCClient } from '../../gsc/client.js';
import type { ToolResult } from '../../types.js';
import {
    formatCtr,
    formatPosition,
    stripUrlPrefix,
    formatRows,
    DEFAULT_ROW_LIMIT,
    type FormatOptions,
} from './formatters.js';

export const opportunityTools = [
    {
        name: 'opportunities.lowCtrHighPos',
        description: `Find "quick win" opportunities: queries ranking in positions 4-20 with high impressions but low CTR.
    
These are opportunities where small improvements could significantly increase clicks.
A typical target CTR for positions 4-20 is 3-5%, so queries below 3% are flagged.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to analyze',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD), defaults to 28 days ago',
                },
                endDate: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD), defaults to today',
                },
                minImpressions: {
                    type: 'number',
                    description: 'Minimum impressions to consider (default: 100)',
                    default: 100,
                },
                maxCtr: {
                    type: 'number',
                    description: 'Maximum CTR to flag as opportunity (default: 0.03 = 3%)',
                    default: 0.03,
                },
                minPosition: {
                    type: 'number',
                    description: 'Minimum position (default: 4)',
                    default: 4,
                },
                maxPosition: {
                    type: 'number',
                    description: 'Maximum position (default: 20)',
                    default: 20,
                },
                limit: {
                    type: 'number',
                    description: `Maximum opportunities to return (default: ${DEFAULT_ROW_LIMIT})`,
                    default: DEFAULT_ROW_LIMIT,
                },
                format: {
                    type: 'string',
                    enum: ['full', 'compact'],
                    description: 'Response format: "full" (default) or "compact" (LLM-optimized)',
                    default: 'full',
                },
            },
            required: ['siteUrl'],
        },
    },
    {
        name: 'opportunities.cannibalization',
        description: `Detect keyword cannibalization: multiple URLs ranking for the same query.
    
This happens when multiple pages compete for the same keyword, potentially diluting ranking power.
Returns queries where 2+ pages rank, sorted by total impressions.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to analyze',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD), defaults to 28 days ago',
                },
                endDate: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD), defaults to today',
                },
                minImpressions: {
                    type: 'number',
                    description: 'Minimum total impressions to consider (default: 50)',
                    default: 50,
                },
                limit: {
                    type: 'number',
                    description: `Maximum issues to return (default: ${DEFAULT_ROW_LIMIT})`,
                    default: DEFAULT_ROW_LIMIT,
                },
                format: {
                    type: 'string',
                    enum: ['full', 'compact'],
                    description: 'Response format: "full" (default) or "compact" (LLM-optimized)',
                    default: 'full',
                },
            },
            required: ['siteUrl'],
        },
    },
    {
        name: 'report.weeklySummary',
        description: `Generate a weekly performance summary with comparisons to the previous week.
    
Includes:
- Total clicks, impressions, CTR, and position
- Week-over-week changes
- Top queries and pages
- Device breakdown`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to analyze',
                },
                endDate: {
                    type: 'string',
                    description: 'End date of the week (YYYY-MM-DD), defaults to yesterday',
                },
                format: {
                    type: 'string',
                    enum: ['full', 'compact'],
                    description: 'Response format: "full" (default) or "compact" (LLM-optimized)',
                    default: 'full',
                },
            },
            required: ['siteUrl'],
        },
    },
];

export async function handleOpportunityTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    const client = await GSCClient.create();
    const siteUrl = args.siteUrl as string;
    const format = (args.format as 'full' | 'compact') || 'full';
    const formatOptions: FormatOptions = { format, siteUrl };
    const compact = format === 'compact';

    // Default date range: last 28 days
    const today = new Date();
    const defaultEndDate = today.toISOString().split('T')[0];
    const defaultStartDate = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    if (name === 'opportunities.lowCtrHighPos') {
        const {
            startDate = defaultStartDate,
            endDate = defaultEndDate,
            minImpressions = 100,
            maxCtr = 0.03,
            minPosition = 4,
            maxPosition = 20,
            limit = DEFAULT_ROW_LIMIT,
        } = args as {
            startDate?: string;
            endDate?: string;
            minImpressions?: number;
            maxCtr?: number;
            minPosition?: number;
            maxPosition?: number;
            limit?: number;
        };

        // Query with query+page dimensions
        const response = await client.searchAnalytics({
            siteUrl,
            startDate,
            endDate,
            dimensions: ['query', 'page'],
            rowLimit: 10000,
        });

        // Filter for opportunities
        const opportunities = (response.rows || [])
            .filter(
                (row) =>
                    row.impressions >= minImpressions &&
                    row.ctr < maxCtr &&
                    row.position >= minPosition &&
                    row.position <= maxPosition
            )
            .map((row) => {
                const potentialClicks = Math.round(row.impressions * 0.05 - row.clicks);
                if (compact) {
                    return {
                        q: row.keys?.[0] || '',
                        page: stripUrlPrefix(row.keys?.[1] || '', siteUrl),
                        clicks: row.clicks,
                        imp: row.impressions,
                        ctr: formatCtr(row.ctr, true),
                        pos: formatPosition(row.position),
                        potential: potentialClicks,
                    };
                }
                return {
                    query: row.keys?.[0] || '',
                    page: stripUrlPrefix(row.keys?.[1] || '', siteUrl),
                    clicks: row.clicks,
                    impressions: row.impressions,
                    ctr: formatCtr(row.ctr, false),
                    position: formatPosition(row.position),
                    potentialClicks,
                };
            })
            .sort((a, b) => (b.potential ?? b.potentialClicks) - (a.potential ?? a.potentialClicks))
            .slice(0, limit);

        const totalPotential = opportunities.reduce((sum, o) => sum + (o.potential ?? o.potentialClicks), 0);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            summary: compact
                                ? `Found ${opportunities.length} quick wins with ${totalPotential} potential clicks`
                                : {
                                    opportunitiesFound: opportunities.length,
                                    totalPotentialClicks: totalPotential,
                                    criteria: {
                                        minImpressions,
                                        maxCtr: `${(maxCtr * 100).toFixed(1)}%`,
                                        positionRange: `${minPosition}-${maxPosition}`,
                                    },
                                    dateRange: { startDate, endDate },
                                },
                            opportunities,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    if (name === 'opportunities.cannibalization') {
        const {
            startDate = defaultStartDate,
            endDate = defaultEndDate,
            minImpressions = 50,
            limit = DEFAULT_ROW_LIMIT,
        } = args as {
            startDate?: string;
            endDate?: string;
            minImpressions?: number;
            limit?: number;
        };

        // Query with query+page dimensions
        const response = await client.searchAnalytics({
            siteUrl,
            startDate,
            endDate,
            dimensions: ['query', 'page'],
            rowLimit: 25000,
        });

        // Group by query
        const queryMap = new Map<string, Array<{
            page: string;
            clicks: number;
            impressions: number;
            ctr: number;
            position: number;
        }>>();

        for (const row of response.rows || []) {
            const query = row.keys?.[0] || '';
            const page = row.keys?.[1] || '';

            if (!queryMap.has(query)) {
                queryMap.set(query, []);
            }
            queryMap.get(query)!.push({
                page,
                clicks: row.clicks,
                impressions: row.impressions,
                ctr: row.ctr,
                position: row.position,
            });
        }

        // Find cannibalization issues (2+ pages for same query)
        const issues: Array<{
            query: string;
            pages: Array<{
                page: string;
                clicks: number;
                impressions: number;
                ctr: number | string;
                position: number;
            }>;
            totalImpressions: number;
            recommendation: string;
        }> = [];

        for (const [query, pages] of queryMap) {
            if (pages.length < 2) continue;

            const totalImpressions = pages.reduce((sum, p) => sum + p.impressions, 0);
            if (totalImpressions < minImpressions) continue;

            // Sort pages by position (best first)
            pages.sort((a, b) => a.position - b.position);

            // Generate recommendation
            const bestPage = pages[0];
            const bestPagePath = stripUrlPrefix(bestPage.page, siteUrl);
            let recommendation: string;

            if (bestPage.position < 5) {
                recommendation = `Consider consolidating content into ${bestPagePath} and redirecting other pages.`;
            } else {
                recommendation = `Multiple pages competing. Consider: 1) Consolidate into one authoritative page, 2) Differentiate content focus, or 3) Use canonical tags.`;
            }

            // Format pages with stripped URLs and truncated precision
            const formattedPages = pages.map(p => ({
                page: stripUrlPrefix(p.page, siteUrl),
                clicks: p.clicks,
                impressions: compact ? undefined : p.impressions,
                imp: compact ? p.impressions : undefined,
                ctr: formatCtr(p.ctr, compact),
                position: formatPosition(p.position),
                pos: undefined,
            })).map(p => {
                // Clean up undefined fields
                const cleaned: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(p)) {
                    if (v !== undefined) cleaned[k] = v;
                }
                return cleaned;
            });

            issues.push({
                query,
                pages: formattedPages as typeof issues[0]['pages'],
                totalImpressions,
                recommendation,
            });
        }

        // Sort by total impressions and limit
        issues.sort((a, b) => b.totalImpressions - a.totalImpressions);
        const topIssues = issues.slice(0, limit);

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            summary: compact
                                ? `Found ${topIssues.length} cannibalization issues from ${queryMap.size} queries`
                                : {
                                    issuesFound: topIssues.length,
                                    totalQueriesAnalyzed: queryMap.size,
                                    dateRange: { startDate, endDate },
                                },
                            issues: topIssues,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    if (name === 'report.weeklySummary') {
        const { endDate } = args as { endDate?: string };

        // Calculate date ranges
        const end = endDate ? new Date(endDate) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const weekStart = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
        const prevWeekEnd = new Date(weekStart.getTime() - 24 * 60 * 60 * 1000);
        const prevWeekStart = new Date(prevWeekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

        const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

        // Fetch data for both weeks in parallel
        const [
            currentTotals,
            prevTotals,
            topQueries,
            topPages,
            deviceData,
        ] = await Promise.all([
            // Current week totals
            client.searchAnalytics({
                siteUrl,
                startDate: formatDateStr(weekStart),
                endDate: formatDateStr(end),
                rowLimit: 1,
            }),
            // Previous week totals
            client.searchAnalytics({
                siteUrl,
                startDate: formatDateStr(prevWeekStart),
                endDate: formatDateStr(prevWeekEnd),
                rowLimit: 1,
            }),
            // Top queries
            client.searchAnalytics({
                siteUrl,
                startDate: formatDateStr(weekStart),
                endDate: formatDateStr(end),
                dimensions: ['query'],
                rowLimit: 10,
            }),
            // Top pages
            client.searchAnalytics({
                siteUrl,
                startDate: formatDateStr(weekStart),
                endDate: formatDateStr(end),
                dimensions: ['page'],
                rowLimit: 10,
            }),
            // Device breakdown
            client.searchAnalytics({
                siteUrl,
                startDate: formatDateStr(weekStart),
                endDate: formatDateStr(end),
                dimensions: ['device'],
                rowLimit: 5,
            }),
        ]);

        // Calculate totals
        const calcTotals = (rows: typeof currentTotals.rows) => {
            if (!rows || rows.length === 0) return null;
            return rows.reduce<{ clicks: number; impressions: number; ctr: number; position: number; totalImpressions: number }>(
                (acc, row) => ({
                    clicks: acc.clicks + row.clicks,
                    impressions: acc.impressions + row.impressions,
                    ctr: 0,
                    position: acc.position + row.position * row.impressions,
                    totalImpressions: acc.totalImpressions + row.impressions,
                }),
                { clicks: 0, impressions: 0, ctr: 0, position: 0, totalImpressions: 0 }
            );
        };

        const current = calcTotals(currentTotals.rows);
        const previous = calcTotals(prevTotals.rows);

        // Format rows with truncated precision and stripped URLs
        const formattedTopQueries = formatRows(topQueries.rows, formatOptions);
        const formattedTopPages = formatRows(topPages.rows, formatOptions);

        const currentCtr = current?.impressions ? current.clicks / current.impressions : 0;
        const currentPos = current?.totalImpressions ? current.position / current.totalImpressions : 0;
        const prevCtr = previous?.impressions ? previous.clicks / previous.impressions : 0;
        const prevPos = previous?.totalImpressions ? previous.position / previous.totalImpressions : 0;

        const summaryData = {
            period: {
                startDate: formatDateStr(weekStart),
                endDate: formatDateStr(end),
            },
            totals: current
                ? {
                    clicks: current.clicks,
                    impressions: current.impressions,
                    ctr: formatCtr(currentCtr, true),
                    position: formatPosition(currentPos),
                }
                : { clicks: 0, impressions: 0, ctr: '0.00%', position: 0 },
            previousPeriod: previous
                ? {
                    clicks: previous.clicks,
                    impressions: previous.impressions,
                    ctr: formatCtr(prevCtr, true),
                    position: formatPosition(prevPos),
                }
                : undefined,
            changes: current && previous
                ? {
                    clicks: `${current.clicks - previous.clicks >= 0 ? '+' : ''}${current.clicks - previous.clicks}`,
                    impressions: `${current.impressions - previous.impressions >= 0 ? '+' : ''}${current.impressions - previous.impressions}`,
                    ctr: `${currentCtr - prevCtr >= 0 ? '+' : ''}${((currentCtr - prevCtr) * 100).toFixed(2)}%`,
                    position: `${currentPos - prevPos >= 0 ? '+' : ''}${formatPosition(currentPos - prevPos)}`,
                }
                : undefined,
            topQueries: formattedTopQueries,
            topPages: formattedTopPages,
            deviceBreakdown: (deviceData.rows || []).map((row) => ({
                device: row.keys?.[0] || 'unknown',
                clicks: row.clicks,
                impressions: compact ? undefined : row.impressions,
                imp: compact ? row.impressions : undefined,
            })).map(d => {
                const cleaned: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(d)) {
                    if (v !== undefined) cleaned[k] = v;
                }
                return cleaned;
            }),
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(summaryData, null, 2),
                },
            ],
        };
    }

    return {
        content: [{ type: 'text', text: `Unknown opportunity tool: ${name}` }],
        isError: true,
    };
}
