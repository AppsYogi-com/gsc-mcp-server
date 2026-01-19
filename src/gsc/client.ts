import { google, searchconsole_v1 } from 'googleapis';
import { loadConfig } from '../auth/tokenStore.js';
import { createOAuthClient } from '../auth/oauth.js';
import { createServiceAccountClient } from '../auth/serviceAccount.js';
import type {
    SearchAnalyticsQuery,
    SearchAnalyticsResponse,
    SiteInfo,
    SitemapInfo,
    UrlInspectionResult,
} from '../types.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MAX_ROWS_PER_REQUEST = 25000;

/**
 * Google Search Console API Client
 * 
 * Wraps the googleapis client with:
 * - Automatic authentication (OAuth or service account)
 * - Quota-aware retries with exponential backoff
 * - Pagination handling for large result sets
 */
export class GSCClient {
    private webmasters: searchconsole_v1.Searchconsole;

    private constructor(webmasters: searchconsole_v1.Searchconsole) {
        this.webmasters = webmasters;
    }

    /**
     * Create an authenticated GSC client
     */
    static async create(): Promise<GSCClient> {
        const config = await loadConfig();

        let auth;
        if (config.authType === 'service-account') {
            auth = await createServiceAccountClient();
        } else {
            auth = await createOAuthClient();
        }

        const webmasters = google.searchconsole({
            version: 'v1',
            auth,
        });

        return new GSCClient(webmasters);
    }

    /**
     * List all sites (properties) the user has access to
     */
    async listSites(): Promise<SiteInfo[]> {
        const response = await this.withRetry(() =>
            this.webmasters.sites.list()
        );

        return (response.data.siteEntry || []).map((site) => ({
            siteUrl: site.siteUrl || '',
            permissionLevel: site.permissionLevel || 'unknown',
        }));
    }

    /**
     * Get details for a specific site
     */
    async getSite(siteUrl: string): Promise<SiteInfo | null> {
        try {
            const response = await this.withRetry(() =>
                this.webmasters.sites.get({ siteUrl })
            );

            return {
                siteUrl: response.data.siteUrl || siteUrl,
                permissionLevel: response.data.permissionLevel || 'unknown',
            };
        } catch {
            return null;
        }
    }

    /**
     * Query search analytics data
     * 
     * Handles pagination automatically for large result sets
     */
    async searchAnalytics(
        query: SearchAnalyticsQuery
    ): Promise<SearchAnalyticsResponse> {
        const { siteUrl, rowLimit = 1000, startRow = 0, ...params } = query;

        // If requesting more than max rows, paginate
        if (rowLimit > MAX_ROWS_PER_REQUEST) {
            return this.searchAnalyticsPaginated(query);
        }

        const response = await this.withRetry(() =>
            this.webmasters.searchanalytics.query({
                siteUrl,
                requestBody: {
                    startDate: params.startDate,
                    endDate: params.endDate,
                    dimensions: params.dimensions,
                    dimensionFilterGroups: params.dimensionFilterGroups,
                    rowLimit,
                    startRow,
                    dataState: params.dataState,
                    aggregationType: params.aggregationType,
                },
            })
        );

        return {
            rows: response.data.rows?.map((row) => ({
                keys: row.keys || undefined,
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: row.ctr || 0,
                position: row.position || 0,
            })),
            responseAggregationType: response.data.responseAggregationType || undefined,
        };
    }

    /**
     * Paginated search analytics for large result sets
     */
    private async searchAnalyticsPaginated(
        query: SearchAnalyticsQuery
    ): Promise<SearchAnalyticsResponse> {
        const allRows: SearchAnalyticsResponse['rows'] = [];
        let startRow = query.startRow || 0;
        const totalRowsRequested = query.rowLimit || MAX_ROWS_PER_REQUEST;
        let responseAggregationType: string | undefined;

        while (allRows.length < totalRowsRequested) {
            const rowsToFetch = Math.min(
                MAX_ROWS_PER_REQUEST,
                totalRowsRequested - allRows.length
            );

            const response = await this.searchAnalytics({
                ...query,
                rowLimit: rowsToFetch,
                startRow,
            });

            if (!response.rows || response.rows.length === 0) {
                break;
            }

            allRows.push(...response.rows);
            responseAggregationType = response.responseAggregationType;

            if (response.rows.length < rowsToFetch) {
                // No more data available
                break;
            }

            startRow += rowsToFetch;
        }

        return {
            rows: allRows,
            responseAggregationType,
        };
    }

    /**
     * List sitemaps for a site
     */
    async listSitemaps(siteUrl: string): Promise<SitemapInfo[]> {
        const response = await this.withRetry(() =>
            this.webmasters.sitemaps.list({ siteUrl })
        );

        return (response.data.sitemap || []).map((sitemap) => ({
            path: sitemap.path || '',
            lastSubmitted: sitemap.lastSubmitted || undefined,
            isPending: sitemap.isPending || undefined,
            isSitemapsIndex: sitemap.isSitemapsIndex || undefined,
            type: sitemap.type || undefined,
            lastDownloaded: sitemap.lastDownloaded || undefined,
            warnings: sitemap.warnings ? Number(sitemap.warnings) : undefined,
            errors: sitemap.errors ? Number(sitemap.errors) : undefined,
        }));
    }

    /**
     * Get details for a specific sitemap
     */
    async getSitemap(siteUrl: string, feedpath: string): Promise<SitemapInfo | null> {
        try {
            const response = await this.withRetry(() =>
                this.webmasters.sitemaps.get({ siteUrl, feedpath })
            );

            return {
                path: response.data.path || feedpath,
                lastSubmitted: response.data.lastSubmitted || undefined,
                isPending: response.data.isPending || undefined,
                isSitemapsIndex: response.data.isSitemapsIndex || undefined,
                type: response.data.type || undefined,
                lastDownloaded: response.data.lastDownloaded || undefined,
                warnings: response.data.warnings ? Number(response.data.warnings) : undefined,
                errors: response.data.errors ? Number(response.data.errors) : undefined,
            };
        } catch {
            return null;
        }
    }

    /**
     * Submit a sitemap (requires full scope)
     */
    async submitSitemap(siteUrl: string, feedpath: string): Promise<void> {
        await this.withRetry(() =>
            this.webmasters.sitemaps.submit({ siteUrl, feedpath })
        );
    }

    /**
     * Delete a sitemap (requires full scope)
     */
    async deleteSitemap(siteUrl: string, feedpath: string): Promise<void> {
        await this.withRetry(() =>
            this.webmasters.sitemaps.delete({ siteUrl, feedpath })
        );
    }

    /**
     * Inspect a URL (requires full scope)
     */
    async inspectUrl(
        siteUrl: string,
        inspectionUrl: string
    ): Promise<UrlInspectionResult> {
        const response = await this.withRetry(() =>
            this.webmasters.urlInspection.index.inspect({
                requestBody: {
                    inspectionUrl,
                    siteUrl,
                },
            })
        );

        return response.data as UrlInspectionResult;
    }

    /**
     * Retry wrapper with exponential backoff
     */
    private async withRetry<T>(
        operation: () => Promise<T>,
        retries = MAX_RETRIES
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // Check if it's a retryable error
                const isRetryable = this.isRetryableError(lastError);

                if (!isRetryable || attempt === retries) {
                    throw lastError;
                }

                // Exponential backoff
                const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    /**
     * Check if an error is retryable
     */
    private isRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();

        // Rate limit errors
        if (message.includes('quota') || message.includes('rate limit')) {
            return true;
        }

        // Network errors
        if (
            message.includes('econnreset') ||
            message.includes('etimedout') ||
            message.includes('enotfound')
        ) {
            return true;
        }

        // Server errors (5xx)
        if (message.includes('500') || message.includes('503')) {
            return true;
        }

        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
