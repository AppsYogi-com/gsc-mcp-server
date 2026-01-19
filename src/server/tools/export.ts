import { GSCClient } from '../../gsc/client.js';
import type { ToolResult, SearchAnalyticsRow } from '../../types.js';

export const exportTools = [
    {
        name: 'export.csv',
        description: `Export search analytics data as CSV format.
    
Returns data in CSV format that can be saved to a file or imported into spreadsheets.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to query',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD)',
                },
                endDate: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD)',
                },
                dimensions: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['query', 'page', 'country', 'device', 'searchAppearance', 'date'],
                    },
                    description: 'Dimensions to include as columns',
                },
                rowLimit: {
                    type: 'number',
                    description: 'Maximum rows to export (default: 1000, max: 25000)',
                    default: 1000,
                },
            },
            required: ['siteUrl', 'startDate', 'endDate'],
        },
    },
    {
        name: 'export.json',
        description: `Export search analytics data as formatted JSON.
    
Returns data in a structured JSON format suitable for further processing.`,
        inputSchema: {
            type: 'object' as const,
            properties: {
                siteUrl: {
                    type: 'string',
                    description: 'The site URL (property) to query',
                },
                startDate: {
                    type: 'string',
                    description: 'Start date (YYYY-MM-DD)',
                },
                endDate: {
                    type: 'string',
                    description: 'End date (YYYY-MM-DD)',
                },
                dimensions: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['query', 'page', 'country', 'device', 'searchAppearance', 'date'],
                    },
                    description: 'Dimensions to group by',
                },
                rowLimit: {
                    type: 'number',
                    description: 'Maximum rows to export (default: 1000, max: 25000)',
                    default: 1000,
                },
            },
            required: ['siteUrl', 'startDate', 'endDate'],
        },
    },
];

export async function handleExportTool(
    name: string,
    args: Record<string, unknown>
): Promise<ToolResult> {
    const client = await GSCClient.create();

    const {
        siteUrl,
        startDate,
        endDate,
        dimensions = ['query'],
        rowLimit = 1000,
    } = args as {
        siteUrl: string;
        startDate: string;
        endDate: string;
        dimensions?: ('query' | 'page' | 'country' | 'device' | 'searchAppearance' | 'date')[];
        rowLimit?: number;
    };

    const response = await client.searchAnalytics({
        siteUrl,
        startDate,
        endDate,
        dimensions,
        rowLimit,
    });

    if (name === 'export.csv') {
        const csv = convertToCSV(response.rows || [], dimensions);
        return {
            content: [
                {
                    type: 'text',
                    text: csv,
                },
            ],
        };
    }

    if (name === 'export.json') {
        const formatted = (response.rows || []).map((row) => {
            const obj: Record<string, unknown> = {};

            // Add dimension values
            dimensions.forEach((dim, index) => {
                obj[dim] = row.keys?.[index] || '';
            });

            // Add metrics
            obj.clicks = row.clicks;
            obj.impressions = row.impressions;
            obj.ctr = row.ctr;
            obj.position = row.position;

            return obj;
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            metadata: {
                                siteUrl,
                                startDate,
                                endDate,
                                dimensions,
                                rowCount: formatted.length,
                                exportedAt: new Date().toISOString(),
                            },
                            data: formatted,
                        },
                        null,
                        2
                    ),
                },
            ],
        };
    }

    return {
        content: [{ type: 'text', text: `Unknown export tool: ${name}` }],
        isError: true,
    };
}

function convertToCSV(
    rows: SearchAnalyticsRow[],
    dimensions: string[]
): string {
    if (rows.length === 0) {
        return `${dimensions.join(',')},clicks,impressions,ctr,position\n`;
    }

    // Header
    const headers = [...dimensions, 'clicks', 'impressions', 'ctr', 'position'];
    const lines: string[] = [headers.join(',')];

    // Data rows
    for (const row of rows) {
        const values: string[] = [];

        // Dimension values
        dimensions.forEach((_, index) => {
            const value = row.keys?.[index] || '';
            // Escape quotes and wrap in quotes if contains comma
            values.push(escapeCSVValue(value));
        });

        // Metric values
        values.push(String(row.clicks));
        values.push(String(row.impressions));
        values.push((row.ctr * 100).toFixed(2) + '%');
        values.push(row.position.toFixed(1));

        lines.push(values.join(','));
    }

    return lines.join('\n');
}

function escapeCSVValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
