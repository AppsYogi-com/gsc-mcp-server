# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **`url_key` on every page row**: in `searchanalytics.query`, `report.comparePeriods`, `report.weeklySummary`, `opportunities.lowCtrHighPos`, `opportunities.cannibalization`, `export.json` and, as a last column, `export.csv`. It's the page's host and path (`https://www.Example.com/blog/post/?x=1` → `example.com/blog/post`), built with the same rules as the GA4 MCP server, so agents can join Search Console, Analytics and AdSense data per page.
- Tests: vitest unit and tool tests, plus a smoke test of the built CLI over stdio (`npm test`, `npm run test:smoke`).

### Changed
- **`format: "full"` now returns page URLs exactly as Search Console reports them.** They used to be shortened to paths, so `http://`/`https://` and `www`/bare-host variants of a page showed up as identical rows. `format: "compact"` still shortens pages to paths, with `url_key` added.
- `report.comparePeriods` totals now include `ctr`, and `avgPosition` is `null` for a period with no impressions.
- CI: lint is now enforced, and tests, the smoke test and a check for `dist/index.d.ts` run on Node.js 20 and 22. The package still supports Node.js 18.

### Fixed
- `gsc-mcp init` sign-in:
  - It now uses PKCE (S256) and checks the OAuth `state`.
  - It opens the browser before waiting. The browser used to open only after sign-in had already finished.
  - It no longer hangs after sign-in: the 5-minute timer is cleared and the local callback server is closed, open connections included.
  - The error shown on the callback page is HTML-escaped.
  - The local callback server listens on a port the OS picks, on 127.0.0.1.
- Reading the `gsc://sites` and `gsc://sites/{siteUrl}/sitemaps` resources always failed, because `gsc://sites` was parsed as a URL with `sites` as its host.
- `report.comparePeriods` totals were sums of the top `rowLimit` rows, with an unweighted average position. They now come from a no-dimension query per period, which gives the property's real totals and impression-weighted position.
- Weekly rollups (`granularity: "weekly"`/`"auto"`):
  - Sundays were put in the following week. Rollups now use ISO weeks, Monday to Sunday.
  - Dates were mixed between local time and UTC, so results depended on the machine's timezone.
  - The rollup only saw the first `rowLimit` days (25 by default). It now rolls up the whole range, then applies `rowLimit` to the weekly or monthly rows.
  - Position is impression-weighted, and other dimensions are kept, so `["query", "date"]` rolls up per query.
- Compact format no longer cuts a URL-prefix property's path out of page URLs (`https://example.com/blog/` turned `/blog/post` into `/post`), and no longer strips look-alike hosts such as `example.com.evil.net`.
- The package ships `dist/index.d.ts`, which `exports.types` already pointed at.
- `npm run lint` works: it uses eslint 9 with typescript-eslint, using a flat config.

## [0.2.3] - 2026-11-12

### Security
- Upgraded `zod` from 3 to 4.6.7, fixing a memory-exhaustion issue when validating oversized inputs ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). Invalid tool input is still rejected, but validation error messages now use `zod` 4's wording.
- Upgraded `googleapis` from 140 to 176 and `google-auth-library` from 9 to 10, now declared as a direct dependency since the code imports it. `googleapis-common` is pinned to 8.0.1, because 8.0.2+ pin an old `gaxios` with a vulnerable `rimraf` chain. Together these clear the `uuid` advisory ([GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). Fresh installs now audit at 0 vulnerabilities, and Node.js 18 is still supported.
- Development lock file: applied `npm audit fix`, which moves the MCP SDK to 1.32 and patches its HTTP server dependencies.

## [0.2.2] - 2026-11-12

### Fixed
- The MCP server now reports the real package version to clients. It was hard-coded as `0.1.0`. `--version` and the server both read the version from `package.json` at build time, so they can't drift again.

### Changed
- Releases are published from GitHub Actions through npm trusted publishing (OIDC), staged for maintainer approval with 2FA and with provenance attestations. No long-lived npm token is stored anywhere.

## [0.2.1] - 2026-01-28

### Fixed
- CLI version now correctly displays 0.2.1
- Documentation updates for LLM optimization features

## [0.2.0] - 2026-01-28

### Added
- **LLM-optimized response format** (`format: "compact"`) - Reduces token consumption by 50-70%
  - Short key names (`imp` instead of `impressions`, `pos` instead of `position`)
  - CTR as percentage string (`"5.41%"` instead of `0.0541...`)
  - Natural language summary field for quick insights
- **Date rollup granularity** (`granularity: "weekly" | "monthly" | "auto"`) - For date dimension queries
  - Reduces 200+ daily rows to ~30 weekly or ~7 monthly rows
  - `auto` picks appropriate granularity based on date range
- **URL prefix stripping** - Page URLs show paths only (`/blog/post` instead of full URL)

### Changed
- **Default rowLimit reduced from 1000 to 25** - Optimized for LLM context windows
  - Higher limits still available (max 25000) for export/analysis use cases
- **Numeric precision truncated** - CTR to 4 decimals, position to 1 decimal
  - Reduces token consumption by ~30-40% on numeric-heavy responses

### Fixed
- Resolved GitHub issues #1-#5 (LLM token optimization)

## [0.1.1] - 2026-01-19

### Changed
- Package renamed to `@appsyogi/gsc-mcp-server`
- Added CI/CD workflows for automated testing and publishing

## [0.1.0] - 2026-01-19

### Added
- Initial release
- **Search Analytics**: Query clicks, impressions, CTR, and position data
- **SEO Opportunities**: Find low-CTR keywords, detect keyword cannibalization
- **Reports**: Weekly summaries, period comparisons
- **Sitemaps**: List, get, submit, and delete sitemaps
- **URL Inspection**: Check indexing status (requires full scope)
- **Export**: CSV and JSON export formats
- **Caching**: SQLite cache for faster repeated queries
- **Authentication**: OAuth2 and service account support
- **Secure Storage**: Tokens stored in OS keychain

### Tools
- `searchanalytics.query` - Query search performance data
- `report.comparePeriods` - Compare two time periods
- `report.weeklySummary` - Weekly performance summary
- `opportunities.lowCtrHighPos` - Find quick-win keywords
- `opportunities.cannibalization` - Detect keyword cannibalization
- `sitemaps.list` - List all sitemaps
- `sitemaps.get` - Get sitemap details
- `sitemaps.submit` - Submit a sitemap (full scope)
- `sitemaps.delete` - Delete a sitemap (full scope)
- `urlInspection.inspect` - Inspect URL indexing status (full scope)
- `urlInspection.batchInspect` - Batch URL inspection (full scope)
- `export.csv` - Export data as CSV
- `export.json` - Export data as JSON
