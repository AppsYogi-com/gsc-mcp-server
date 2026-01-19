import { z } from 'zod';

// ============================================================================
// Configuration Types
// ============================================================================

export const ConfigSchema = z.object({
    clientId: z.string(),
    clientSecret: z.string(),
    defaultProperty: z.string().optional(),
    scope: z.enum(['readonly', 'full']).default('readonly'),
    authType: z.enum(['oauth', 'service-account']).default('oauth'),
    serviceAccountPath: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
}

// ============================================================================
// GSC API Types
// ============================================================================

export const SearchAnalyticsQuerySchema = z.object({
    siteUrl: z.string().describe('The site URL (property) to query'),
    startDate: z.string().describe('Start date in YYYY-MM-DD format'),
    endDate: z.string().describe('End date in YYYY-MM-DD format'),
    dimensions: z.array(z.enum(['query', 'page', 'country', 'device', 'searchAppearance', 'date']))
        .optional()
        .describe('Dimensions to group by'),
    dimensionFilterGroups: z.array(z.object({
        groupType: z.enum(['and', 'or']).optional(),
        filters: z.array(z.object({
            dimension: z.enum(['query', 'page', 'country', 'device', 'searchAppearance']),
            operator: z.enum(['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex']),
            expression: z.string(),
        })),
    })).optional().describe('Filters to apply'),
    rowLimit: z.number().min(1).max(25000).optional()
        .describe('Maximum rows to return (max 25000)'),
    startRow: z.number().min(0).optional()
        .describe('Starting row for pagination'),
    dataState: z.enum(['all', 'final']).optional()
        .describe('Data freshness: "all" includes fresh data, "final" only finalized'),
    aggregationType: z.enum(['auto', 'byPage', 'byProperty']).optional()
        .describe('How to aggregate results'),
});

export type SearchAnalyticsQuery = z.infer<typeof SearchAnalyticsQuerySchema>;

export interface SearchAnalyticsRow {
    keys?: string[];
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
}

export interface SearchAnalyticsResponse {
    rows?: SearchAnalyticsRow[];
    responseAggregationType?: string;
}

export interface SiteInfo {
    siteUrl: string;
    permissionLevel: string;
}

export interface SitemapInfo {
    path: string;
    lastSubmitted?: string;
    isPending?: boolean;
    isSitemapsIndex?: boolean;
    type?: string;
    lastDownloaded?: string;
    warnings?: number;
    errors?: number;
}

export interface UrlInspectionResult {
    inspectionResult?: {
        inspectionResultLink?: string;
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
                items?: Array<{
                    name?: string;
                    issues?: Array<{
                        issueMessage?: string;
                        severity?: string;
                    }>;
                }>;
            }>;
        };
    };
}

// ============================================================================
// Opportunity Types
// ============================================================================

export interface LowCtrOpportunity {
    query: string;
    page?: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    potentialClicks: number;
}

export interface CannibalizationIssue {
    query: string;
    pages: Array<{
        page: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    }>;
    totalImpressions: number;
    recommendation: string;
}

export interface WeeklySummary {
    period: {
        startDate: string;
        endDate: string;
    };
    totals: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    };
    previousPeriod?: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    };
    changes?: {
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
    };
    topQueries: SearchAnalyticsRow[];
    topPages: SearchAnalyticsRow[];
    deviceBreakdown: Array<{
        device: string;
        clicks: number;
        impressions: number;
    }>;
}

// ============================================================================
// Cache Types
// ============================================================================

export interface CachedQuery {
    id: number;
    queryHash: string;
    siteUrl: string;
    query: string;
    response: string;
    createdAt: number;
    expiresAt: number;
}

export interface SavedPreset {
    id: number;
    name: string;
    siteUrl: string;
    query: string;
    createdAt: number;
    updatedAt: number;
}

// ============================================================================
// MCP Types
// ============================================================================

export interface ToolResult {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}

export const SCOPES: Record<'readonly' | 'full', string[]> = {
    readonly: ['https://www.googleapis.com/auth/webmasters.readonly'],
    full: ['https://www.googleapis.com/auth/webmasters'],
};

export type ScopeLevel = keyof typeof SCOPES;
