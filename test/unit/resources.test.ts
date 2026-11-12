import { describe, expect, it } from 'vitest';
import { getAllResources, handleResourceRead, parseResourceUri } from '../../src/server/resources/index.js';

const sites = [
    { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
    { siteUrl: 'https://www.example.org/', permissionLevel: 'siteFullUser' },
];

function fakeClient(calls: string[] = []) {
    return async () => ({
        listSites: async () => {
            calls.push('listSites');
            return sites;
        },
        listSitemaps: async (siteUrl: string) => {
            calls.push(`listSitemaps ${siteUrl}`);
            return [{ path: `${siteUrl}sitemap.xml`, errors: 0, warnings: 0 }];
        },
    });
}

describe('parseResourceUri', () => {
    it.each([
        ['gsc://sites', { kind: 'sites' }],
        ['gsc://sites/', { kind: 'sites' }],
        ['gsc://sites/sc-domain%3Aexample.com/sitemaps', { kind: 'sitemaps', siteUrl: 'sc-domain:example.com' }],
        ['gsc://sites/https%3A%2F%2Fwww.example.org%2F/sitemaps', { kind: 'sitemaps', siteUrl: 'https://www.example.org/' }],
        // a client that decodes the URI before sending it
        ['gsc://sites/https://www.example.org//sitemaps', { kind: 'sitemaps', siteUrl: 'https://www.example.org/' }],
    ])('%s', (uri, expected) => {
        expect(parseResourceUri(uri)).toEqual(expected);
    });

    it.each([
        'gsc://other',
        'gsc://sites/x/other',
        'gsc://sites//sitemaps',
        'gsc://sites/%E0%A4%A/sitemaps',
        'https://sites/x/sitemaps',
    ])('rejects %s', (uri) => {
        expect(parseResourceUri(uri)).toBeNull();
    });
});

describe('resources', () => {
    it('lists the sites resource and a sitemaps resource per site, all readable', async () => {
        const resources = await getAllResources(fakeClient());
        expect(resources.map((r) => r.uri)).toEqual([
            'gsc://sites',
            'gsc://sites/sc-domain%3Aexample.com/sitemaps',
            'gsc://sites/https%3A%2F%2Fwww.example.org%2F/sitemaps',
        ]);
        for (const resource of resources) {
            expect(parseResourceUri(resource.uri)).not.toBeNull();
        }
    });

    it('reads gsc://sites', async () => {
        const calls: string[] = [];
        const result = await handleResourceRead('gsc://sites', fakeClient(calls));
        expect(calls).toEqual(['listSites']);
        expect(result.contents[0].uri).toBe('gsc://sites');
        expect(result.contents[0].mimeType).toBe('application/json');
        expect(JSON.parse(result.contents[0].text)).toEqual(sites);
    });

    it('reads gsc://sites/{siteUrl}/sitemaps with the decoded site URL', async () => {
        const calls: string[] = [];
        const uri = 'gsc://sites/https%3A%2F%2Fwww.example.org%2F/sitemaps';
        const result = await handleResourceRead(uri, fakeClient(calls));
        expect(calls).toEqual(['listSitemaps https://www.example.org/']);
        expect(JSON.parse(result.contents[0].text)[0].path).toBe('https://www.example.org/sitemap.xml');
    });

    it('rejects unknown resources without calling Google', async () => {
        const calls: string[] = [];
        await expect(handleResourceRead('gsc://nope', fakeClient(calls))).rejects.toThrow('Unknown resource: gsc://nope');
        expect(calls).toEqual([]);
    });
});
