# GSC-MCP-Server

> Google Search Console MCP Server — Connect Google Search Console to Claude, Cursor, and other MCP clients.

[![npm version](https://img.shields.io/npm/v/@appsyogi/gsc-mcp-server.svg)](https://www.npmjs.com/package/@appsyogi/gsc-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@appsyogi/gsc-mcp-server.svg)](https://www.npmjs.com/package/@appsyogi/gsc-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/AppsYogi-com/gsc-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/AppsYogi-com/gsc-mcp-server/actions/workflows/ci.yml)

## Features

- 🔍 **Search Analytics** — Query clicks, impressions, CTR, and position data
- 📊 **SEO Opportunities** — Find low-CTR keywords, detect cannibalization issues
- 📈 **Reports** — Weekly summaries, period comparisons
- 🗺️ **Sitemaps** — List, submit, and manage sitemaps
- 🔎 **URL Inspection** — Check indexing status (requires full scope)
- 💾 **Caching** — SQLite cache for faster repeated queries
- 🔐 **Secure** — OAuth tokens stored in OS keychain

## Quick Start

```bash
# Install globally
npm install -g @appsyogi/gsc-mcp-server

# Set up OAuth credentials
gsc-mcp init

# Verify setup
gsc-mcp doctor

# Start the server (for MCP clients)
gsc-mcp run
```

## Prerequisites

### 1. Create Google Cloud OAuth Credentials

You need to create your own OAuth credentials in Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Search Console API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Search Console API"
   - Click "Enable"
4. Create OAuth credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Desktop application"
   - Name it (e.g., "GSC-MCP")
   - Click "Create"
5. Copy the **Client ID** and **Client Secret**
6. Add test users (required while app is in testing mode):
   - Go to "APIs & Services" → "OAuth consent screen"
   - Scroll to "Test users" section
   - Click "Add users"
   - Add the Google account email(s) you'll use to authenticate
   - Click "Save"

> **Note:** While your app's publishing status is "Testing", only test users can authenticate. You can add up to 100 test users.

### 2. Configure GSC-MCP

Run the init command and enter your credentials:

```bash
gsc-mcp init
```

This will:
- Prompt for your Client ID and Client Secret
- Open a browser for Google authentication
- Store your refresh token securely in the OS keychain

## Usage

### CLI Commands

```bash
# Initialize with OAuth (interactive)
gsc-mcp init

# Initialize with service account
gsc-mcp init --service-account /path/to/key.json

# Initialize with full scope (for sitemap submission, URL inspection)
gsc-mcp init --scope full

# Check configuration and connectivity
gsc-mcp doctor
gsc-mcp doctor --verbose

# Start MCP server (stdio mode)
gsc-mcp run

# Start in HTTP mode (for debugging)
gsc-mcp run --http 3333

# View current configuration
gsc-mcp config

# Clear credentials
gsc-mcp logout
```

### MCP Client Configuration

#### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "gsc": {
      "command": "gsc-mcp",
      "args": ["run"]
    }
  }
}
```

#### VS Code (Copilot)

Add to your VS Code MCP settings (`~/.vscode/mcp.json` or workspace settings):

```json
{
  "servers": {
    "gsc": {
      "command": "gsc-mcp",
      "args": ["run"],
      "type": "stdio"
    }
  }
}
```

#### Cursor

Add to your Cursor MCP config:

```json
{
  "mcpServers": {
    "gsc": {
      "command": "npx",
      "args": ["-y", "@appsyogi/gsc-mcp-server", "run"]
    }
  }
}
```

## Available Tools

### Search Analytics

| Tool | Description |
|------|-------------|
| `searchanalytics.query` | Query search performance data with dimensions and filters |
| `report.comparePeriods` | Compare two time periods (totals are the property's totals for each period) |

### Sitemaps

| Tool | Description | Scope |
|------|-------------|-------|
| `sitemaps.list` | List all sitemaps | readonly |
| `sitemaps.get` | Get sitemap details | readonly |
| `sitemaps.submit` | Submit a sitemap | full |
| `sitemaps.delete` | Delete a sitemap | full |

### URL Inspection

| Tool | Description | Scope |
|------|-------------|-------|
| `urlInspection.inspect` | Inspect a URL's indexing status | full |
| `urlInspection.batchInspect` | Inspect multiple URLs | full |

### SEO Opportunities

| Tool | Description |
|------|-------------|
| `opportunities.lowCtrHighPos` | Find quick-win keywords (position 4-20, low CTR) |
| `opportunities.cannibalization` | Detect keyword cannibalization |
| `report.weeklySummary` | Generate weekly performance summary |

### Export

| Tool | Description |
|------|-------------|
| `export.csv` | Export data as CSV |
| `export.json` | Export data as JSON |

## Joining with GA4 and AdSense (`url_key`)

Every row with a page (in `searchanalytics.query`, `report.comparePeriods`, `report.weeklySummary`, the opportunity tools and the exports) has a `url_key`: the page's host and path, normalized the same way as the [GA4 MCP server](https://github.com/AppsYogi-com/ga-mcp-server) and the AdSense MCP server do it, so an agent can join Search Console, Analytics and AdSense data for the same page.

```
https://www.Example.com/blog/post/?utm_source=x  ->  example.com/blog/post
```

- The host is lowercased, without `www.` or a port.
- The path keeps its case, without the query string, a trailing slash or `/index.html`.

Page URLs themselves are returned exactly as Search Console reports them in `full` format, so `http://` and `https://`, `www` and bare-host variants of a page stay distinct rows. They share a `url_key`, so add them up when joining.

## LLM Optimization (v0.2.0+)

All tools support parameters to reduce token consumption for LLM use cases:

### Compact Response Format

Add `format: "compact"` to any tool for LLM-optimized output:

```json
{
  "siteUrl": "sc-domain:example.com",
  "startDate": "2026-01-01",
  "endDate": "2026-01-28",
  "dimensions": ["query"],
  "format": "compact"
}
```

**Compact format features:**
- Short key names (`imp` instead of `impressions`, `pos` instead of `position`)
- CTR as percentage string (`"5.41%"` instead of `0.054123...`)
- Natural language summary field
- Page URLs on the property's own host shortened to paths (`/blog/post`). Variants such as `http://` and `https://` then look alike, so use `url_key` to tell pages apart, or `full` format for exact URLs.

**Example compact response:**
```json
{
  "summary": "Top query 'example keyword' got 150 clicks at position 3.2",
  "rows": [
    {"key": "example keyword", "clicks": 150, "imp": 2800, "ctr": "5.36%", "pos": 3.2}
  ]
}
```

### Date Rollup Granularity

For date dimension queries, use `granularity` to reduce row count:

```json
{
  "siteUrl": "sc-domain:example.com",
  "startDate": "2025-07-01",
  "endDate": "2026-01-28",
  "dimensions": ["date"],
  "granularity": "weekly"
}
```

**Options:**
- `daily` — Default, returns daily data
- `weekly` — Aggregates by ISO week (Monday to Sunday), keyed by the week's Monday
- `monthly` — Aggregates by calendar month (`YYYY-MM`)
- `auto` — Picks based on date range (>90 days = monthly, >21 days = weekly)

Rollups cover the whole date range: `rowLimit` applies to the weekly or monthly rows, not the daily ones. Position is impression-weighted, as Search Console averages it.

### Default Row Limits

Default `rowLimit` is **25** (optimized for LLM context windows). Use higher values when needed:

```json
{
  "siteUrl": "sc-domain:example.com",
  "rowLimit": 100
}
```

Maximum: 25,000 rows.

## Resources

The server exposes browsable resources:

- `gsc://sites` — List all properties
- `gsc://sites/{siteUrl}/sitemaps` — List sitemaps for a property

## Scopes

GSC-MCP supports two permission levels:

### Readonly (default)
- Search analytics queries
- List sitemaps
- SEO analysis tools

```bash
gsc-mcp init  # Uses readonly by default
```

### Full
- Everything in readonly, plus:
- Submit/delete sitemaps
- URL inspection

```bash
gsc-mcp init --scope full
```

## Configuration Files

GSC-MCP stores configuration in platform-specific locations:

| Platform | Config Path |
|----------|-------------|
| macOS | `~/.config/gsc-mcp/` |
| Linux | `~/.config/gsc-mcp/` |
| Windows | `%APPDATA%/gsc-mcp/` |

Files:
- `config.json` — OAuth client ID/secret, scope settings
- `cache.sqlite` — Query cache and saved presets

Tokens are stored securely in the OS keychain when available.

## Service Account Setup

For automated/server use, you can use a service account instead of OAuth:

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Add the service account email as an owner in Google Search Console
4. Initialize:

```bash
gsc-mcp init --service-account /path/to/key.json
```

## API Quotas

Google Search Console API has a default quota of **1,200 queries per day**. GSC-MCP includes:

- Automatic retry with exponential backoff
- Query caching to reduce API calls
- Pagination handling for large result sets

## Examples

### Find Quick-Win Keywords

```
Use gsc-mcp to find quick-win opportunities for my site https://example.com
```

### Weekly Report

```
Generate a weekly performance summary for https://example.com
```

### Compare Periods

```
Compare search performance for https://example.com between last week and the week before
```

### Export Data

```
Export the top 1000 queries for https://example.com in the last 28 days as CSV
```

## Development

```bash
# Clone the repo
git clone https://github.com/AppsYogi-com/gsc-mcp-server.git
cd gsc-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run in dev mode
npm run dev

# Typecheck, lint and test (Node.js 20+ for lint and tests)
npm run typecheck
npm run lint
npm test
npm run test:smoke   # the built CLI over stdio; run `npm run build` first

# Test locally
node dist/cli/index.js doctor
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or PR.

## Credits

Built with:
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [googleapis](https://github.com/googleapis/google-api-nodejs-client)
- [commander](https://github.com/tj/commander.js)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
