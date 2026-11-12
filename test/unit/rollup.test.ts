import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isoWeekStart, monthOf, resolveGranularity, rollupByGranularity } from '../../src/server/tools/rollup.js';

const row = (keys: string[], clicks: number, impressions: number, position: number) => ({
    keys,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position,
});

// Run in a timezone west of UTC, where local-time date math used to shift days.
const originalTz = process.env.TZ;
beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
    process.env.TZ = originalTz;
});

describe('isoWeekStart', () => {
    it.each([
        ['2026-11-09', '2026-11-09'], // Monday
        ['2026-11-12', '2026-11-09'], // Thursday
        ['2026-11-15', '2026-11-09'], // Sunday belongs to the week that started on Monday
        ['2026-11-16', '2026-11-16'], // next Monday
        ['2026-01-01', '2025-12-29'], // across a year boundary
        ['2024-03-03', '2024-02-26'], // Sunday across a leap-day month boundary
    ])('%s -> %s', (date, monday) => {
        expect(isoWeekStart(date)).toBe(monday);
    });

    it('rejects non-dates', () => {
        expect(isoWeekStart('not-a-date')).toBeNull();
    });
});

describe('monthOf', () => {
    it('uses the calendar month of the date string', () => {
        expect(monthOf('2026-11-01')).toBe('2026-11');
        expect(monthOf('2026-10-31')).toBe('2026-10');
    });
});

describe('resolveGranularity', () => {
    it('resolves auto by range length', () => {
        expect(resolveGranularity('auto', '2026-11-01', '2026-11-14')).toBe('daily');
        expect(resolveGranularity('auto', '2026-10-01', '2026-11-14')).toBe('weekly');
        expect(resolveGranularity('auto', '2026-01-01', '2026-11-14')).toBe('monthly');
        expect(resolveGranularity('weekly', '2026-11-01', '2026-11-02')).toBe('weekly');
    });
});

describe('rollupByGranularity', () => {
    it('groups Monday-Sunday weeks and weights position by impressions', () => {
        const rows = [
            row(['2026-11-08'], 1, 10, 5), // Sunday: previous week
            row(['2026-11-09'], 4, 100, 2), // Monday
            row(['2026-11-15'], 6, 300, 6), // Sunday: same week as the Monday
            row(['2026-11-16'], 2, 20, 9), // next Monday
        ];
        const weekly = rollupByGranularity(rows, 'weekly');
        expect(weekly.map((r) => r.keys)).toEqual([['2026-11-02'], ['2026-11-09'], ['2026-11-16']]);
        const week = weekly[1];
        expect(week.clicks).toBe(10);
        expect(week.impressions).toBe(400);
        expect(week.ctr).toBeCloseTo(10 / 400);
        // (2 * 100 + 6 * 300) / 400 = 5, not the unweighted (2 + 6) / 2 = 4
        expect(week.position).toBeCloseTo(5);
    });

    it('groups calendar months', () => {
        const rows = [row(['2026-10-31'], 1, 10, 1), row(['2026-11-01'], 2, 10, 3), row(['2026-11-30'], 3, 30, 5)];
        const monthly = rollupByGranularity(rows, 'monthly');
        expect(monthly.map((r) => [r.keys![0], r.clicks, r.impressions])).toEqual([
            ['2026-10', 1, 10],
            ['2026-11', 5, 40],
        ]);
        expect(monthly[1].position).toBeCloseTo((3 * 10 + 5 * 30) / 40);
    });

    it('keeps other dimensions, wherever the date is', () => {
        const rows = [
            row(['a', '2026-11-09'], 1, 10, 1),
            row(['b', '2026-11-10'], 5, 10, 1),
            row(['a', '2026-11-11'], 2, 10, 3),
        ];
        const weekly = rollupByGranularity(rows, 'weekly', ['query', 'date']);
        expect(weekly.map((r) => [r.keys, r.clicks])).toEqual([
            [['b', '2026-11-09'], 5],
            [['a', '2026-11-09'], 3],
        ]);
    });

    it('returns rows unchanged without a date dimension', () => {
        const rows = [row(['q'], 1, 1, 1)];
        expect(rollupByGranularity(rows, 'weekly', ['query'])).toBe(rows);
    });
});
