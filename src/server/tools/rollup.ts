/**
 * Date rollups for Search Analytics rows (issue #3): daily rows -> ISO weeks or calendar months.
 *
 * Search Console dates are plain YYYY-MM-DD strings (in Pacific Time, per Google). They are
 * handled as UTC calendar dates here, never as local times, so results don't depend on the
 * machine's timezone.
 */

import type { SearchAnalyticsRow } from '../../types.js';

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'auto';
export type RollupGranularity = 'weekly' | 'monthly';

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(dateStr: string): number | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Monday of the ISO week (Monday-Sunday) containing a YYYY-MM-DD date, as YYYY-MM-DD. */
export function isoWeekStart(dateStr: string): string | null {
    const time = parseDate(dateStr);
    if (time === null) return null;
    const daysSinceMonday = (new Date(time).getUTCDay() + 6) % 7;
    return new Date(time - daysSinceMonday * DAY_MS).toISOString().slice(0, 10);
}

/** Calendar month of a YYYY-MM-DD date, as YYYY-MM. */
export function monthOf(dateStr: string): string | null {
    return parseDate(dateStr) === null ? null : dateStr.slice(0, 7);
}

/** Resolve "auto" by range length (>90 days monthly, >21 days weekly, else daily). */
export function resolveGranularity(
    granularity: Granularity,
    startDate: string,
    endDate: string
): 'daily' | RollupGranularity {
    if (granularity !== 'auto') return granularity;
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (start === null || end === null) return 'daily';
    const days = Math.round((end - start) / DAY_MS);
    if (days > 90) return 'monthly';
    if (days > 21) return 'weekly';
    return 'daily';
}

/**
 * Roll up daily rows into weekly (keyed by the week's Monday) or monthly (YYYY-MM) buckets.
 * Other dimensions are kept, so ["query", "date"] rolls up per query. Clicks and impressions are
 * summed, CTR is recomputed, and position is impression-weighted (as Search Console averages it).
 * Rows are sorted by bucket, then by clicks (descending).
 */
export function rollupByGranularity(
    rows: SearchAnalyticsRow[],
    granularity: RollupGranularity,
    dimensions: string[] = ['date']
): SearchAnalyticsRow[] {
    const dateIndex = dimensions.indexOf('date');
    if (dateIndex < 0) return rows;

    const buckets = new Map<string, { keys: string[]; clicks: number; impressions: number; weightedPosition: number }>();

    for (const row of rows) {
        const dateStr = row.keys?.[dateIndex];
        if (!row.keys || !dateStr) continue;
        const bucket = granularity === 'monthly' ? monthOf(dateStr) : isoWeekStart(dateStr);
        if (!bucket) continue;

        const keys = row.keys.map((key, i) => (i === dateIndex ? bucket : key));
        const id = JSON.stringify(keys);
        let acc = buckets.get(id);
        if (!acc) {
            acc = { keys, clicks: 0, impressions: 0, weightedPosition: 0 };
            buckets.set(id, acc);
        }
        acc.clicks += row.clicks;
        acc.impressions += row.impressions;
        acc.weightedPosition += row.position * row.impressions;
    }

    const rolledUp: SearchAnalyticsRow[] = [...buckets.values()].map((acc) => ({
        keys: acc.keys,
        clicks: acc.clicks,
        impressions: acc.impressions,
        ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
        position: acc.impressions > 0 ? acc.weightedPosition / acc.impressions : 0,
    }));

    rolledUp.sort((a, b) => a.keys![dateIndex].localeCompare(b.keys![dateIndex]) || b.clicks - a.clicks);
    return rolledUp;
}
