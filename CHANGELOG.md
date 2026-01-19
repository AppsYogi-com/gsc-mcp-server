# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
