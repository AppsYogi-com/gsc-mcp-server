# GSC-MCP Copilot Instructions

## Project Overview
This is a **Model Context Protocol (MCP) server** that provides Google Search Console (GSC) API access to AI clients (Claude, Cursor, VS Code Copilot). It's distributed as a CLI tool via npm (`gsc-mcp`) with OAuth/service account authentication.

## Architecture

```
src/
├── index.ts          # Public exports for programmatic use
├── types.ts          # Zod schemas & TypeScript types (single source of truth)
├── cli/              # Commander-based CLI (`gsc-mcp init|doctor|run`)
├── server/           # MCP server implementation
│   ├── index.ts      # Server factory with stdio/HTTP transports
│   ├── tools/        # MCP tools organized by domain (searchAnalytics, sitemaps, etc.)
│   └── resources/    # MCP resources
├── gsc/client.ts     # GSC API wrapper with retry logic & pagination
├── auth/             # OAuth2 + service account auth, token storage (keytar/file)
└── cache/sqlite.ts   # SQLite cache with TTL for query results
```

**Key data flows:**
1. CLI commands → `createServer()` → MCP transport (stdio for clients, HTTP for debugging)
2. Tool calls → `handleToolCall()` routes to domain handlers → `GSCClient` → Google API
3. Tokens stored via `keytar` (OS keychain) with file fallback; config in `env-paths` directories

## Development Commands

```bash
npm run build      # tsup build (ESM, Node 18+)
npm run dev        # Watch mode
npm run typecheck  # tsc --noEmit
npm run lint       # eslint src/
gsc-mcp run --http 3333  # Debug server with HTTP endpoints
```

## Code Conventions

### Adding New MCP Tools
1. Create tool definition in `src/server/tools/<domain>.ts` following the pattern:
   - Export `<domain>Tools` array with `name`, `description`, `inputSchema`
   - Export `handle<Domain>Tool(name, args)` handler function
2. Register in `src/server/tools/index.ts` by adding to `getAllTools()` and routing in `handleToolCall()`
3. Tool names use dot notation: `searchanalytics.query`, `opportunities.lowCtrHighPos`

### Type Definitions
- Define Zod schemas in `src/types.ts`, derive TypeScript types with `z.infer<>`
- Tool input schemas in tool files mirror Zod schemas but use plain JSON Schema format for MCP

### Error Handling Pattern
```typescript
return {
    content: [{ type: 'text', text: `Error: ${error.message}` }],
    isError: true,
};
```

### GSCClient Usage
- Always use `GSCClient.create()` factory (handles auth automatically)
- Built-in retry with exponential backoff (`withRetry()`)
- Pagination handled internally for large result sets (>25000 rows)

## Auth Scopes
- `readonly` (default): Read analytics, sitemaps list
- `full`: Additionally allows sitemap submission, URL inspection
- Scope set at init time: `gsc-mcp init --scope full`

## External Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `googleapis` - Google Search Console API
- `keytar` - OS keychain (optional, file fallback)
- `better-sqlite3` - Query result caching
- `zod` - Runtime validation

## Testing Changes
1. Run `npm run build`
2. Test CLI: `./dist/cli/index.js doctor --verbose`
3. Test MCP tools via HTTP: `gsc-mcp run --http 3333`, then curl `/tools` or POST to `/mcp`
