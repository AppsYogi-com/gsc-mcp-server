/**
 * GSC-MCP: Google Search Console MCP Server
 * 
 * This module exports the MCP server for programmatic use.
 * For CLI usage, see ./cli/index.ts
 */

export { createServer } from './server/index.js';
export { GSCClient } from './gsc/client.js';
export { CacheStore } from './cache/sqlite.js';
export * from './types.js';
export * from './auth/index.js';
