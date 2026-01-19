import { searchAnalyticsTools, handleSearchAnalyticsTool } from './searchAnalytics.js';
import { sitemapTools, handleSitemapTool } from './sitemaps.js';
import { urlInspectionTools, handleUrlInspectionTool } from './urlInspection.js';
import { opportunityTools, handleOpportunityTool } from './opportunities.js';
import { exportTools, handleExportTool } from './export.js';
import type { ToolResult } from '../../types.js';

interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}

/**
 * Get all available tools
 */
export function getAllTools(): Tool[] {
    return [
        ...searchAnalyticsTools,
        ...sitemapTools,
        ...urlInspectionTools,
        ...opportunityTools,
        ...exportTools,
    ];
}

/**
 * Handle tool call
 */
export async function handleToolCall(
    name: string,
    args: Record<string, unknown>,
    defaultProperty?: string
): Promise<ToolResult> {
    // Inject default property if not specified
    if (defaultProperty && !args.siteUrl) {
        args.siteUrl = defaultProperty;
    }

    try {
        // Route to appropriate handler
        if (searchAnalyticsTools.some((t) => t.name === name)) {
            return await handleSearchAnalyticsTool(name, args);
        }

        if (sitemapTools.some((t) => t.name === name)) {
            return await handleSitemapTool(name, args);
        }

        if (urlInspectionTools.some((t) => t.name === name)) {
            return await handleUrlInspectionTool(name, args);
        }

        if (opportunityTools.some((t) => t.name === name)) {
            return await handleOpportunityTool(name, args);
        }

        if (exportTools.some((t) => t.name === name)) {
            return await handleExportTool(name, args);
        }

        return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
        };
    } catch (error) {
        return {
            content: [
                {
                    type: 'text',
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        };
    }
}
