/**
 * Response formatting utilities for LLM-optimized output
 * 
 * Addresses:
 * - Issue #1: Truncate numeric precision
 * - Issue #2: Strip redundant URL prefixes
 * - Issue #5: Compact response format
 */

import type { SearchAnalyticsRow } from '../../types.js';

export interface FormatOptions {
    /** Response format: 'full' (default) or 'compact' (LLM-optimized) */
    format?: 'full' | 'compact';
    /** Site URL for stripping prefixes (issue #2) */
    siteUrl?: string;
}

/**
 * Round CTR to 4 decimal places (or format as percentage string in compact mode)
 */
export function formatCtr(ctr: number, compact = false): number | string {
    if (compact) {
        return `${(ctr * 100).toFixed(2)}%`;
    }
    return Math.round(ctr * 10000) / 10000;
}

/**
 * Round position to 1 decimal place
 */
export function formatPosition(position: number): number {
    return Math.round(position * 10) / 10;
}

/**
 * Strip the siteUrl prefix from a page URL
 */
export function stripUrlPrefix(url: string, siteUrl?: string): string {
    if (!siteUrl || !url) return url;

    // Normalize siteUrl - handle both domain property and URL prefix formats
    let prefix = siteUrl;

    // Handle sc-domain: format (e.g., "sc-domain:example.com")
    if (prefix.startsWith('sc-domain:')) {
        const domain = prefix.replace('sc-domain:', '');
        // Try stripping https://domain, https://www.domain, http://domain, http://www.domain
        const prefixes = [
            `https://${domain}`,
            `https://www.${domain}`,
            `http://${domain}`,
            `http://www.${domain}`,
        ];
        for (const p of prefixes) {
            if (url.startsWith(p)) {
                return url.slice(p.length) || '/';
            }
        }
        return url;
    }

    // Handle URL prefix format (e.g., "https://example.com/")
    // Remove trailing slash for matching
    prefix = prefix.replace(/\/$/, '');

    if (url.startsWith(prefix)) {
        return url.slice(prefix.length) || '/';
    }

    return url;
}

/**
 * Format a single analytics row with truncated precision
 */
export function formatRow(
    row: SearchAnalyticsRow,
    options: FormatOptions = {}
): Record<string, unknown> {
    const { format = 'full', siteUrl } = options;
    const compact = format === 'compact';

    // Process keys (strip URL prefixes for page dimension)
    let keys = row.keys;
    if (keys && siteUrl) {
        keys = keys.map(key => {
            // If it looks like a URL, strip the prefix
            if (key.startsWith('http://') || key.startsWith('https://')) {
                return stripUrlPrefix(key, siteUrl);
            }
            return key;
        });
    }

    if (compact) {
        // Compact format with short keys (issue #5)
        const result: Record<string, unknown> = {};

        if (keys && keys.length > 0) {
            // Use short key names based on what the key represents
            // For single-dimension queries, just use the value directly
            if (keys.length === 1) {
                result.key = keys[0];
            } else {
                result.keys = keys;
            }
        }

        result.clicks = row.clicks;
        result.imp = row.impressions;
        result.ctr = formatCtr(row.ctr, true);
        result.pos = formatPosition(row.position);

        return result;
    }

    // Full format with truncated precision (issue #1)
    return {
        keys,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: formatCtr(row.ctr, false),
        position: formatPosition(row.position),
    };
}

/**
 * Format an array of analytics rows
 */
export function formatRows(
    rows: SearchAnalyticsRow[] | undefined,
    options: FormatOptions = {}
): Record<string, unknown>[] {
    if (!rows) return [];
    return rows.map(row => formatRow(row, options));
}

/**
 * Generate a natural language summary for compact format
 */
export function generateSummary(
    rows: SearchAnalyticsRow[] | undefined,
    dimensions?: string[]
): string | undefined {
    if (!rows || rows.length === 0) return undefined;

    const topRow = rows[0];
    const dimensionType = dimensions?.[0] || 'item';

    let keyDescription = '';
    if (topRow.keys && topRow.keys.length > 0) {
        keyDescription = `'${topRow.keys[0]}'`;
    }

    return `Top ${dimensionType} ${keyDescription} got ${topRow.clicks} clicks from ${topRow.impressions} impressions at position ${formatPosition(topRow.position)}`;
}

/**
 * Default row limits (issue #4)
 */
export const DEFAULT_ROW_LIMIT = 25;
export const DEFAULT_ROW_LIMIT_LARGE = 100;

/**
 * Extract format options from tool arguments
 */
export function extractFormatOptions(args: Record<string, unknown>): FormatOptions {
    return {
        format: (args.format as 'full' | 'compact') || 'full',
        siteUrl: args.siteUrl as string | undefined,
    };
}
