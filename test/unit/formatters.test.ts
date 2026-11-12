import { describe, expect, it } from 'vitest';
import { formatRow, formatRows, pageKeyIndex, stripUrlPrefix } from '../../src/server/tools/formatters.js';

const metrics = { clicks: 10, impressions: 200, ctr: 0.05, position: 3.456 };

describe('stripUrlPrefix (compact format)', () => {
    it.each([
        // domain property: bare and www hosts, either scheme
        ['https://example.com/a/b', 'sc-domain:example.com', '/a/b'],
        ['https://www.example.com/a/b', 'sc-domain:example.com', '/a/b'],
        ['http://example.com/', 'sc-domain:example.com', '/'],
        ['https://example.com', 'sc-domain:example.com', '/'],
        ['https://example.com?x=1', 'sc-domain:example.com', '/?x=1'],
        // other hosts are left whole: subdomains, and look-alike hosts that share a prefix
        ['https://blog.example.com/a', 'sc-domain:example.com', 'https://blog.example.com/a'],
        ['https://example.com.evil.net/a', 'sc-domain:example.com', 'https://example.com.evil.net/a'],
        ['https://example.community/a', 'sc-domain:example.com', 'https://example.community/a'],
        // URL-prefix property: only the origin is removed, the path stays whole
        ['https://www.example.org/blog/post', 'https://www.example.org/', '/blog/post'],
        ['https://www.example.org/blog/post', 'https://www.example.org/blog/', '/blog/post'],
        ['https://example.org/blog/post', 'https://www.example.org/', 'https://example.org/blog/post'],
        // no site URL
        ['https://example.com/a', undefined, 'https://example.com/a'],
    ])('%s on %s -> %s', (url, siteUrl, expected) => {
        expect(stripUrlPrefix(url, siteUrl)).toBe(expected);
    });
});

describe('pageKeyIndex', () => {
    it('uses the dimensions when given', () => {
        expect(pageKeyIndex(['q', 'https://a.com/x'], ['query', 'page'])).toBe(1);
        // a query that looks like a URL is not a page
        expect(pageKeyIndex(['https://a.com/x'], ['query'])).toBe(-1);
    });

    it('falls back to the first absolute URL', () => {
        expect(pageKeyIndex(['q', 'https://a.com/x'])).toBe(1);
        expect(pageKeyIndex(['q'])).toBe(-1);
        expect(pageKeyIndex(undefined)).toBe(-1);
    });
});

describe('formatRow', () => {
    const variants = [
        { keys: ['https://gettikvideo.com/'], ...metrics },
        { keys: ['https://www.gettikvideo.com/'], ...metrics },
        { keys: ['http://gettikvideo.com/tiktok-highlights-downloader/'], ...metrics },
        { keys: ['https://gettikvideo.com/tiktok-highlights-downloader'], ...metrics },
    ];
    const options = { siteUrl: 'sc-domain:gettikvideo.com', dimensions: ['page'] };

    it('keeps full page URLs in full format, so URL variants stay distinct, and adds url_key', () => {
        const rows = formatRows(variants, { ...options, format: 'full' });
        expect(rows.map((r) => (r.keys as string[])[0])).toEqual(variants.map((v) => v.keys[0]));
        expect(rows.map((r) => r.url_key)).toEqual([
            'gettikvideo.com/',
            'gettikvideo.com/',
            'gettikvideo.com/tiktok-highlights-downloader',
            'gettikvideo.com/tiktok-highlights-downloader',
        ]);
        expect(rows[0]).toEqual({
            keys: ['https://gettikvideo.com/'],
            url_key: 'gettikvideo.com/',
            clicks: 10,
            impressions: 200,
            ctr: 0.05,
            position: 3.5,
        });
    });

    it('shortens page URLs to paths in compact format and adds url_key', () => {
        expect(formatRow(variants[1], { ...options, format: 'compact' })).toEqual({
            key: '/',
            url_key: 'gettikvideo.com/',
            clicks: 10,
            imp: 200,
            ctr: '5.00%',
            pos: 3.5,
        });
    });

    it('adds url_key for the page key in multi-dimension rows', () => {
        const row = { keys: ['tiktok downloader', 'https://www.gettikvideo.com/a/'], ...metrics };
        const full = formatRow(row, { siteUrl: 'sc-domain:gettikvideo.com', dimensions: ['query', 'page'] });
        expect(full.keys).toEqual(['tiktok downloader', 'https://www.gettikvideo.com/a/']);
        expect(full.url_key).toBe('gettikvideo.com/a');
        const compact = formatRow(row, { format: 'compact', siteUrl: 'sc-domain:gettikvideo.com', dimensions: ['query', 'page'] });
        expect(compact.keys).toEqual(['tiktok downloader', '/a/']);
        expect(compact.url_key).toBe('gettikvideo.com/a');
    });

    it('has no url_key for rows without a page', () => {
        const row = { keys: ['some query'], ...metrics };
        expect(formatRow(row, { dimensions: ['query'] })).not.toHaveProperty('url_key');
        expect(formatRow(row, { format: 'compact', dimensions: ['query'] })).not.toHaveProperty('url_key');
    });
});
