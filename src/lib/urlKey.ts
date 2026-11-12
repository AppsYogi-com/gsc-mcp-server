// Copied from ga-mcp (src/lib/urlKey.ts). Keep the two in sync: url_key is the join contract
// between ga-mcp, gsc-mcp, adsense-mcp and Ahrefs data, so its rules must match exactly.

/**
 * url_key: the join contract between GA4, Search Console, AdSense and Ahrefs page data.
 *
 *   https://www.Example.com/blog/post/?utm_source=x#top  ->  example.com/blog/post
 *
 * Rules:
 * 1. Bare paths are combined with a host; protocol-less URLs (GA4 fullPageUrl) get https://.
 * 2. Host: lowercased, punycode, leading "www." and any port removed.
 * 3. Query string and fragment dropped.
 * 4. Percent-encoding normalized, repeated slashes collapsed.
 * 5. Trailing "/index.html" (or .htm) and trailing "/" removed, except for the root ("/").
 * 6. Path case is kept (servers treat paths as case-sensitive).
 */

const EMPTY_VALUES = new Set(['', '(not set)', '(other)', '(data not available)']);

/** Normalize a host or site identifier: "sc-domain:x", "https://www.X.com/", "x.com:443" -> "x.com". */
export function normalizeHost(input: string | null | undefined): string | null {
    if (!input) return null;
    let value = input.trim();
    if (EMPTY_VALUES.has(value)) return null;
    value = value.replace(/^sc-domain:/i, '');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
    try {
        const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
        if (!host) return null;
        return host.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function normalizePath(pathname: string): string {
    let path = pathname || '/';
    // Normalize percent-encoding (e.g. %7E vs ~, lowercase hex) without touching the case of the path.
    try {
        path = encodeURI(decodeURI(path));
    } catch {
        // Malformed escape sequences: keep the original path.
    }
    path = path.replace(/\/{2,}/g, '/');
    path = path.replace(/\/index\.html?$/i, '/');
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    if (!path.startsWith('/')) path = `/${path}`;
    return path;
}

/**
 * Build the url_key for a URL, a protocol-less URL ("example.com/path"), or a bare path
 * ("/path", which needs `host`). Returns null for empty values such as "(not set)".
 */
export function toUrlKey(input: string | null | undefined, host?: string | null): string | null {
    if (input === null || input === undefined) return null;
    const value = input.trim();
    if (EMPTY_VALUES.has(value)) return null;

    let absolute: string;
    if (value.startsWith('/')) {
        const normalizedHost = normalizeHost(host ?? null);
        if (!normalizedHost) return null;
        absolute = `https://${normalizedHost}${value}`;
    } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        absolute = value;
    } else if (/^sc-domain:/i.test(value)) {
        const normalizedHost = normalizeHost(value);
        return normalizedHost ? `${normalizedHost}/` : null;
    } else {
        absolute = `https://${value}`;
    }

    let url: URL;
    try {
        url = new URL(absolute);
    } catch {
        return null;
    }
    const normalizedHost = normalizeHost(url.hostname);
    if (!normalizedHost) return null;
    const path = normalizePath(url.pathname);
    return `${normalizedHost}${path}`;
}

/** The path part of a url_key ("example.com/blog" -> "/blog"). */
export function urlKeyPath(key: string): string {
    const slash = key.indexOf('/');
    return slash === -1 ? '/' : key.slice(slash);
}

/** The host part of a url_key ("example.com/blog" -> "example.com"). */
export function urlKeyHost(key: string): string {
    const slash = key.indexOf('/');
    return slash === -1 ? key : key.slice(0, slash);
}

/**
 * GA4 path values that should match a url_key path, for building inList filters:
 * "/blog" -> ["/blog", "/blog/", "/blog/index.html"]; "/" -> ["/", "/index.html"].
 */
export function pathVariants(path: string): string[] {
    if (path === '/') return ['/', '/index.html'];
    return [path, `${path}/`, `${path}/index.html`];
}

/** GA4 hostName values that normalize to a host: "example.com" -> ["example.com", "www.example.com"]. */
export function hostVariants(host: string): string[] {
    return [host, `www.${host}`];
}
