import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { getCachePath, ensureDirectories } from '../auth/tokenStore.js';
import type { SavedPreset } from '../types.js';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * SQLite cache for query results and saved presets
 */
export class CacheStore {
    private db: Database.Database;
    private ttl: number;

    private constructor(db: Database.Database, ttl: number) {
        this.db = db;
        this.ttl = ttl;
    }

    /**
     * Create or open the cache database
     */
    static async create(ttl: number = DEFAULT_TTL_MS): Promise<CacheStore> {
        await ensureDirectories();
        const dbPath = getCachePath();
        const db = new Database(dbPath);

        // Enable WAL mode for better performance
        db.pragma('journal_mode = WAL');

        // Create tables
        db.exec(`
      CREATE TABLE IF NOT EXISTS query_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_hash TEXT UNIQUE NOT NULL,
        site_url TEXT NOT NULL,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_query_cache_hash ON query_cache(query_hash);
      CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at);

      CREATE TABLE IF NOT EXISTS saved_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        site_url TEXT NOT NULL,
        query TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_saved_presets_name ON saved_presets(name);
    `);

        return new CacheStore(db, ttl);
    }

    /**
     * Generate a hash for a query
     */
    private hashQuery(siteUrl: string, query: object): string {
        const data = JSON.stringify({ siteUrl, query });
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Get a cached query result
     */
    get(siteUrl: string, query: object): string | null {
        const hash = this.hashQuery(siteUrl, query);
        const now = Date.now();

        const stmt = this.db.prepare(`
      SELECT response FROM query_cache
      WHERE query_hash = ? AND expires_at > ?
    `);

        const row = stmt.get(hash, now) as { response: string } | undefined;
        return row?.response || null;
    }

    /**
     * Store a query result in cache
     */
    set(siteUrl: string, query: object, response: string): void {
        const hash = this.hashQuery(siteUrl, query);
        const now = Date.now();
        const expiresAt = now + this.ttl;

        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO query_cache
      (query_hash, site_url, query, response, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

        stmt.run(hash, siteUrl, JSON.stringify(query), response, now, expiresAt);
    }

    /**
     * Clear expired cache entries
     */
    clearExpired(): number {
        const now = Date.now();
        const stmt = this.db.prepare('DELETE FROM query_cache WHERE expires_at <= ?');
        const result = stmt.run(now);
        return result.changes;
    }

    /**
     * Clear all cache entries
     */
    clearAll(): number {
        const stmt = this.db.prepare('DELETE FROM query_cache');
        const result = stmt.run();
        return result.changes;
    }

    /**
     * Get cache statistics
     */
    getStats(): { totalEntries: number; expiredEntries: number; sizeBytes: number } {
        const now = Date.now();

        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM query_cache');
        const expiredStmt = this.db.prepare(
            'SELECT COUNT(*) as count FROM query_cache WHERE expires_at <= ?'
        );

        const total = (totalStmt.get() as { count: number }).count;
        const expired = (expiredStmt.get(now) as { count: number }).count;

        // Get approximate size
        const sizeStmt = this.db.prepare(
            'SELECT SUM(LENGTH(response)) as size FROM query_cache'
        );
        const size = (sizeStmt.get() as { size: number | null }).size || 0;

        return {
            totalEntries: total,
            expiredEntries: expired,
            sizeBytes: size,
        };
    }

    // =========================================================================
    // Saved Presets
    // =========================================================================

    /**
     * Save a query preset
     */
    savePreset(name: string, siteUrl: string, query: object): void {
        const now = Date.now();

        const stmt = this.db.prepare(`
      INSERT INTO saved_presets (name, site_url, query, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        site_url = excluded.site_url,
        query = excluded.query,
        updated_at = excluded.updated_at
    `);

        stmt.run(name, siteUrl, JSON.stringify(query), now, now);
    }

    /**
     * Get a saved preset
     */
    getPreset(name: string): SavedPreset | null {
        const stmt = this.db.prepare(`
      SELECT id, name, site_url, query, created_at, updated_at
      FROM saved_presets WHERE name = ?
    `);

        const row = stmt.get(name) as {
            id: number;
            name: string;
            site_url: string;
            query: string;
            created_at: number;
            updated_at: number;
        } | undefined;

        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            siteUrl: row.site_url,
            query: row.query,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * List all saved presets
     */
    listPresets(): SavedPreset[] {
        const stmt = this.db.prepare(`
      SELECT id, name, site_url, query, created_at, updated_at
      FROM saved_presets ORDER BY updated_at DESC
    `);

        const rows = stmt.all() as Array<{
            id: number;
            name: string;
            site_url: string;
            query: string;
            created_at: number;
            updated_at: number;
        }>;

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            siteUrl: row.site_url,
            query: row.query,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
    }

    /**
     * Delete a preset
     */
    deletePreset(name: string): boolean {
        const stmt = this.db.prepare('DELETE FROM saved_presets WHERE name = ?');
        const result = stmt.run(name);
        return result.changes > 0;
    }

    /**
     * Close the database connection
     */
    close(): void {
        this.db.close();
    }
}
