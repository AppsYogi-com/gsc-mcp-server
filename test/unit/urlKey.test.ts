// Copied from ga-mcp (test/unit/urlKey.test.ts) with src/lib/urlKey.ts: the rules must stay identical.
import { describe, expect, it } from 'vitest';
import { hostVariants, normalizeHost, pathVariants, toUrlKey, urlKeyHost, urlKeyPath } from '../../src/lib/urlKey.js';

describe('toUrlKey', () => {
    it.each([
        // Search Console page URLs
        ['https://www.example.com/blog/post/', undefined, 'example.com/blog/post'],
        ['https://example.com/blog/post', undefined, 'example.com/blog/post'],
        ['http://Example.COM/Blog/Post', undefined, 'example.com/Blog/Post'],
        // AdSense PAGE_URL with query and fragment
        ['https://www.example.com/tool?utm_source=x&id=2#top', undefined, 'example.com/tool'],
        // GA4 fullPageUrl has no protocol
        ['www.example.com/pricing?plan=pro', undefined, 'example.com/pricing'],
        // GA4 pagePath + hostName
        ['/blog/post/', 'www.example.com', 'example.com/blog/post'],
        ['/', 'example.com', 'example.com/'],
        // root forms all agree
        ['https://example.com', undefined, 'example.com/'],
        ['https://www.example.com/', undefined, 'example.com/'],
        ['https://example.com/index.html', undefined, 'example.com/'],
        ['/docs/index.html', 'example.com', 'example.com/docs'],
        // ports and trailing dots
        ['https://example.com:443/a', undefined, 'example.com/a'],
        ['https://example.com:8080/a', undefined, 'example.com/a'],
        // repeated slashes
        ['https://example.com//a///b/', undefined, 'example.com/a/b'],
        // percent-encoding normalized, unicode paths encoded consistently
        ['https://example.com/caf%C3%A9', undefined, 'example.com/caf%C3%A9'],
        ['https://example.com/café', undefined, 'example.com/caf%C3%A9'],
        // internationalized domain -> punycode
        ['https://bücher.example/x', undefined, 'xn--bcher-kva.example/x'],
        // subdomains are kept (only www is stripped)
        ['https://blog.example.com/a', undefined, 'blog.example.com/a'],
        // Search Console domain property
        ['sc-domain:example.com', undefined, 'example.com/'],
    ])('%s (host %s) -> %s', (input, host, expected) => {
        expect(toUrlKey(input, host)).toBe(expected);
    });

    it.each([[null], [undefined], [''], ['(not set)'], ['(other)']])('returns null for %s', (input) => {
        expect(toUrlKey(input as string | null | undefined)).toBeNull();
    });

    it('returns null for a bare path without a host', () => {
        expect(toUrlKey('/blog')).toBeNull();
    });

    it('returns null for garbage', () => {
        expect(toUrlKey('https://')).toBeNull();
    });
});

describe('normalizeHost', () => {
    it.each([
        ['sc-domain:Example.com', 'example.com'],
        ['https://www.example.com/', 'example.com'],
        ['www.example.com', 'example.com'],
        ['example.com:8443', 'example.com'],
        ['blog.example.com', 'blog.example.com'],
        ['(not set)', null],
        ['', null],
    ])('%s -> %s', (input, expected) => {
        expect(normalizeHost(input)).toBe(expected);
    });
});

describe('url_key helpers', () => {
    it('splits host and path', () => {
        expect(urlKeyHost('example.com/blog/post')).toBe('example.com');
        expect(urlKeyPath('example.com/blog/post')).toBe('/blog/post');
        expect(urlKeyPath('example.com/')).toBe('/');
    });

    it('lists GA4 path and host variants for lookups', () => {
        expect(pathVariants('/blog')).toEqual(['/blog', '/blog/', '/blog/index.html']);
        expect(pathVariants('/')).toEqual(['/', '/index.html']);
        expect(hostVariants('example.com')).toEqual(['example.com', 'www.example.com']);
    });
});
