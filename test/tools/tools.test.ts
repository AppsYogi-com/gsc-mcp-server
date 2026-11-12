/**
 * Tool handlers end to end, with a fake Search Console client in place of GSCClient.create().
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GSCClient } from '../../src/gsc/client.js';
import { getAllTools, handleToolCall } from '../../src/server/tools/index.js';
import type { SearchAnalyticsQuery, SearchAnalyticsResponse, SearchAnalyticsRow } from '../../src/types.js';

const SITE = 'sc-domain:example.com';
const row = (keys: string[] | undefined, clicks: number, impressions: number, position: number): SearchAnalyticsRow => ({
    keys,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
});

let requests: SearchAnalyticsQuery[];
let respond: (query: SearchAnalyticsQuery) => SearchAnalyticsRow[];

beforeEach(() => {
    requests = [];
    respond = () => [];
    const fake = {
        searchAnalytics: async (query: SearchAnalyticsQuery): Promise<SearchAnalyticsResponse> => {
            requests.push(query);
            return { rows: respond(query), responseAggregationType: 'byProperty' };
        },
    };
    vi.spyOn(GSCClient, 'create').mockResolvedValue(fake as unknown as GSCClient);
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function call(name: string, args: Record<string, unknown>) {
    const result = await handleToolCall(name, { siteUrl: SITE, ...args });
    expect(result.isError, result.content[0].text).toBeFalsy();
    return result.content[0].text;
}

const callJson = async (name: string, args: Record<string, unknown>) => JSON.parse(await call(name, args));

it('keeps the existing tool names', () => {
    expect(getAllTools().map((t) => t.name)).toContain('searchanalytics.query');
    expect(getAllTools().map((t) => t.name)).toContain('report.comparePeriods');
});

describe('report.comparePeriods', () => {
    const p1 = { startDate: '2026-11-01', endDate: '2026-11-07' };
    const p2 = { startDate: '2026-10-25', endDate: '2026-10-31' };

    beforeEach(() => {
        respond = (q) => {
            const current = q.startDate === p1.startDate;
            if (!q.dimensions?.length) {
                // the property totals, as Search Console aggregates them
                return [current ? row(undefined, 1000, 50000, 12.34) : row(undefined, 800, 40000, 14.0)];
            }
            // just the top N pages
            return current
                ? [row(['https://example.com/a'], 300, 1000, 1.5), row(['https://www.example.com/b/'], 100, 9000, 30)]
                : [row(['https://example.com/a'], 200, 1000, 2.5)];
        };
    });

    it('takes totals from a no-dimension query per period, not from the top-N rows', async () => {
        const out = await callJson('report.comparePeriods', { period1: p1, period2: p2, dimensions: ['page'], rowLimit: 2 });

        expect(out.comparison.period1.totals).toEqual({ clicks: 1000, impressions: 50000, ctr: 0.02, avgPosition: 12.3 });
        expect(out.comparison.period2.totals).toEqual({ clicks: 800, impressions: 40000, ctr: 0.02, avgPosition: 14 });
        expect(out.comparison.changes).toEqual({
            clicks: 200,
            clicksPercent: '25.0%',
            impressions: 10000,
            impressionsPercent: '25.0%',
            avgPosition: -1.7,
        });
        expect(out.comparison.period1.rowCount).toBe(2);

        const totalsQueries = requests.filter((q) => !q.dimensions?.length);
        expect(totalsQueries.map((q) => [q.startDate, q.endDate, q.rowLimit])).toEqual([
            [p1.startDate, p1.endDate, 1],
            [p2.startDate, p2.endDate, 1],
        ]);
        expect(requests).toHaveLength(4);
    });

    it('keeps full page URLs with url_key in the period rows', async () => {
        const out = await callJson('report.comparePeriods', { period1: p1, period2: p2, dimensions: ['page'] });
        expect(out.period1Data[1]).toMatchObject({ keys: ['https://www.example.com/b/'], url_key: 'example.com/b' });
    });

    it('only queries totals when there are no dimensions', async () => {
        const out = await callJson('report.comparePeriods', { period1: p1, period2: p2 });
        expect(requests).toHaveLength(2);
        expect(out.comparison.period1.totals.clicks).toBe(1000);
        expect(out.period1Data).toEqual([]);
    });

    it('handles a period with no data', async () => {
        respond = (q) => (q.startDate === p1.startDate ? [row(undefined, 10, 100, 4)] : []);
        const out = await callJson('report.comparePeriods', { period1: p1, period2: p2 });
        expect(out.comparison.period2.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, avgPosition: null });
        expect(out.comparison.changes.clicksPercent).toBe('N/A');
        expect(out.comparison.changes.avgPosition).toBe('N/A');
    });
});

describe('searchanalytics.query', () => {
    it('returns full page URLs with url_key, so URL variants no longer collide', async () => {
        respond = () => [
            row(['https://example.com/'], 50, 500, 2),
            row(['https://www.example.com/'], 5, 50, 3),
            row(['https://example.com/tool/'], 20, 400, 4),
        ];
        const out = await callJson('searchanalytics.query', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['page'] });
        expect(out.rows.map((r: { keys: string[] }) => r.keys[0])).toEqual([
            'https://example.com/',
            'https://www.example.com/',
            'https://example.com/tool/',
        ]);
        expect(out.rows.map((r: { url_key: string }) => r.url_key)).toEqual(['example.com/', 'example.com/', 'example.com/tool']);
    });

    it('rolls up every daily row into ISO weeks before applying rowLimit', async () => {
        // 2026-10-05 (Monday) to 2026-11-15 (Sunday): six full weeks
        const days: SearchAnalyticsRow[] = [];
        for (let t = Date.UTC(2026, 9, 5); t <= Date.UTC(2026, 10, 15); t += 86400000) {
            days.push(row([new Date(t).toISOString().slice(0, 10)], 1, 10, 5));
        }
        respond = (q) => days.slice(q.startRow ?? 0, (q.startRow ?? 0) + (q.rowLimit ?? 1000));

        const out = await callJson('searchanalytics.query', {
            startDate: '2026-10-05',
            endDate: '2026-11-15',
            dimensions: ['date'],
            granularity: 'weekly',
            rowLimit: 4,
        });

        expect(requests[0]).toMatchObject({ rowLimit: 25000, startRow: 0 });
        expect(out.rows.map((r: { keys: string[] }) => r.keys[0])).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
        // each week has all 7 days, Sunday included
        expect(out.rows.every((r: { clicks: number }) => r.clicks === 7)).toBe(true);
    });
});

describe('opportunities', () => {
    beforeEach(() => {
        respond = () => [
            row(['tiktok downloader', 'https://example.com/a/'], 5, 1000, 6),
            row(['tiktok downloader', 'https://www.example.com/b'], 1, 500, 9),
        ];
    });

    it('cannibalization lists full page URLs with url_key', async () => {
        const out = await callJson('opportunities.cannibalization', { startDate: '2026-11-01', endDate: '2026-11-07' });
        expect(out.issues[0].pages.map((p: { page: string; url_key: string }) => [p.page, p.url_key])).toEqual([
            ['https://example.com/a/', 'example.com/a'],
            ['https://www.example.com/b', 'example.com/b'],
        ]);
    });

    it('lowCtrHighPos shortens pages in compact format and adds url_key', async () => {
        const out = await callJson('opportunities.lowCtrHighPos', { startDate: '2026-11-01', endDate: '2026-11-07', format: 'compact' });
        expect(out.opportunities[0]).toMatchObject({ q: 'tiktok downloader', page: '/a/', url_key: 'example.com/a' });
        const full = await callJson('opportunities.lowCtrHighPos', { startDate: '2026-11-01', endDate: '2026-11-07' });
        expect(full.opportunities[0]).toMatchObject({ page: 'https://example.com/a/', url_key: 'example.com/a' });
    });
});

describe('export', () => {
    beforeEach(() => {
        respond = () => [row(['https://www.example.com/x/', 'q, with comma'], 3, 30, 2)];
    });

    it('adds a url_key column after the existing CSV columns', async () => {
        const csv = await call('export.csv', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['page', 'query'] });
        expect(csv.split('\n')).toEqual([
            'page,query,clicks,impressions,ctr,position,url_key',
            'https://www.example.com/x/,"q, with comma",3,30,10.00%,2.0,example.com/x',
        ]);
    });

    it('adds url_key to JSON rows', async () => {
        const out = await callJson('export.json', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['page', 'query'] });
        expect(out.data[0]).toMatchObject({ page: 'https://www.example.com/x/', url_key: 'example.com/x' });
    });

    it('leaves exports without a page unchanged', async () => {
        respond = () => [row(['q'], 3, 30, 2)];
        const csv = await call('export.csv', { startDate: '2026-11-01', endDate: '2026-11-07', dimensions: ['query'] });
        expect(csv.split('\n')[0]).toBe('query,clicks,impressions,ctr,position');
    });
});
