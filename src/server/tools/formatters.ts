/**
 * Response formatting utilities for LLM-optimized output
 *
 * Addresses:
 * - Issue #1: Truncate numeric precision
 * - Issue #2: Strip redundant URL prefixes (compact format only)
 * - Issue #5: Compact response format
 *
 * Every row with a page gets a `url_key` (see ../../lib/urlKey.ts) for joining with ga-mcp,
 * adsense-mcp and Ahrefs data.
 */

import type { SearchAnalyticsRow } from '../../types.js';
import { toUrlKey } from '../../lib/urlKey.js';

export interface FormatOptions {
    /** Response format: 'full' (default) or 'compact' (LLM-optimized) */
    format?: 'full' | 'compact';
    /** Site URL for stripping prefixes in compact format (issue #2) */
    siteUrl?: string;
    /** Dimensions of the query, in row-key order; used to find the page key */
    dimensions?: string[];
}

const isAbsoluteUrl = (value: string) => value.startsWith('http://') || value.startsWith('https://');

/** The url_key for a Search Console page URL, or undefined if it can't be built. */
export function pageUrlKey(page: string | undefined): string | undefined {
    return toUrlKey(page) ?? undefined;
}

/** Index of the page value in a row's keys, or -1 if the row has no page. */
export function pageKeyIndex(keys: string[] | undefined, dimensions?: string[]): number {
    if (!keys) return -1;
    if (dimensions) return dimensions.indexOf('page');
    return keys.findIndex(isAbsoluteUrl);
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

/** Strip `origin` from `url` only at a path boundary, so "https://a.com" never eats "https://a.com.evil/". */
function stripOrigin(url: string, origin: string): string | null {
    if (!url.startsWith(origin)) return null;
    const rest = url.slice(origin.length);
    if (rest === '') return '/';
    if (rest.startsWith('/')) return rest;
    if (rest.startsWith('?') || rest.startsWith('#')) return `/${rest}`;
    return null;
}

/**
 * Shorten a page URL to its path when it is on the property's own host (compact format).
 * Only the scheme and host are removed; the path is always kept whole, so the result is a real
 * path on the site. URLs on other hosts (e.g. subdomains of a domain property) are returned as is.
 *
 * This is lossy: http/https and www/non-www variants of a page shorten to the same path. Use the
 * row's `url_key` to join, or `format: "full"` for exact URLs.
 */
export function stripUrlPrefix(url: string, siteUrl?: string): string {
    if (!siteUrl || !url) return url;

    let origins: string[];
    if (siteUrl.startsWith('sc-domain:')) {
        // Domain property (e.g., "sc-domain:example.com"): the bare and www hosts, either scheme
        const domain = siteUrl.slice('sc-domain:'.length).toLowerCase();
        origins = [
            `https://${domain}`,
            `https://www.${domain}`,
            `http://${domain}`,
            `http://www.${domain}`,
        ];
    } else {
        // URL-prefix property (e.g., "https://example.com/blog/"): its origin only
        try {
            origins = [new URL(siteUrl).origin];
        } catch {
            return url;
        }
    }

    for (const origin of origins) {
        const stripped = stripOrigin(url, origin);
        if (stripped !== null) return stripped;
    }
    return url;
}

/**
 * Format a single analytics row with truncated precision.
 *
 * Full format keeps page URLs exactly as Search Console returns them; compact format shortens
 * them to paths. Both add `url_key` when the row has a page.
 */
export function formatRow(
    row: SearchAnalyticsRow,
    options: FormatOptions = {}
): Record<string, unknown> {
    const { format = 'full', siteUrl, dimensions } = options;
    const compact = format === 'compact';

    const pageIndex = pageKeyIndex(row.keys, dimensions);
    const urlKey = pageIndex >= 0 ? pageUrlKey(row.keys?.[pageIndex]) : undefined;

    if (compact) {
        // Compact format with short keys (issue #5) and shortened page URLs (issue #2)
        const keys = row.keys?.map((key, i) => (i === pageIndex ? stripUrlPrefix(key, siteUrl) : key));
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
        if (urlKey) result.url_key = urlKey;

        result.clicks = row.clicks;
        result.imp = row.impressions;
        result.ctr = formatCtr(row.ctr, true);
        result.pos = formatPosition(row.position);

        return result;
    }

    // Full format with truncated precision (issue #1)
    return {
        keys: row.keys,
        ...(urlKey ? { url_key: urlKey } : {}),
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
