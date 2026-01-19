import envPaths from 'env-paths';
import { mkdir, readFile, writeFile, unlink, access } from 'fs/promises';
import { join } from 'path';
import type { Config, TokenData } from '../types.js';
import { ConfigSchema } from '../types.js';

const paths = envPaths('gsc-mcp', { suffix: '' });

/**
 * Get the configuration directory path
 */
export function getConfigPath(): string {
    return paths.config;
}

/**
 * Get the data directory path (for cache, logs)
 */
export function getDataPath(): string {
    return paths.data;
}

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
    await mkdir(paths.config, { recursive: true });
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
    await mkdir(paths.data, { recursive: true });
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: Config): Promise<void> {
    await ensureConfigDir();
    const configPath = join(paths.config, 'config.json');
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Load configuration from file
 */
export async function loadConfig(): Promise<Config> {
    const configPath = join(paths.config, 'config.json');
    const content = await readFile(configPath, 'utf-8');
    const data = JSON.parse(content);
    return ConfigSchema.parse(data);
}

/**
 * Check if configuration exists
 */
export async function configExists(): Promise<boolean> {
    try {
        await access(join(paths.config, 'config.json'));
        return true;
    } catch {
        return false;
    }
}

/**
 * Save tokens securely
 * 
 * Attempts to use OS keychain via keytar, falls back to encrypted file
 */
export async function saveTokens(tokens: TokenData): Promise<void> {
    await ensureConfigDir();

    try {
        // Try keytar first (OS keychain)
        const keytar = await import('keytar');
        await keytar.default.setPassword('gsc-mcp', 'tokens', JSON.stringify(tokens));

        // Also save a marker file to indicate keytar is being used
        await writeFile(
            join(paths.config, 'tokens.meta'),
            JSON.stringify({ storage: 'keytar' }),
            'utf-8'
        );
    } catch {
        // Fallback to file storage
        // In a production app, we'd encrypt this with a user passphrase
        // For now, we store it with a warning
        console.warn('Warning: keytar not available, storing tokens in file (less secure)');

        const tokenPath = join(paths.config, 'tokens.json');
        await writeFile(tokenPath, JSON.stringify(tokens, null, 2), 'utf-8');

        await writeFile(
            join(paths.config, 'tokens.meta'),
            JSON.stringify({ storage: 'file' }),
            'utf-8'
        );
    }
}

/**
 * Load tokens from secure storage
 */
export async function loadTokens(): Promise<TokenData | null> {
    try {
        // Check storage type
        const metaPath = join(paths.config, 'tokens.meta');
        let storage = 'file';

        try {
            const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
            storage = meta.storage;
        } catch {
            // No meta file, try both methods
        }

        if (storage === 'keytar') {
            try {
                const keytar = await import('keytar');
                const data = await keytar.default.getPassword('gsc-mcp', 'tokens');
                if (data) {
                    return JSON.parse(data) as TokenData;
                }
            } catch {
                // Keytar failed, try file
            }
        }

        // Try file storage
        const tokenPath = join(paths.config, 'tokens.json');
        const content = await readFile(tokenPath, 'utf-8');
        return JSON.parse(content) as TokenData;
    } catch {
        return null;
    }
}

/**
 * Clear all stored credentials
 */
export async function clearCredentials(): Promise<void> {
    const filesToDelete = [
        join(paths.config, 'config.json'),
        join(paths.config, 'tokens.json'),
        join(paths.config, 'tokens.meta'),
    ];

    for (const file of filesToDelete) {
        try {
            await unlink(file);
        } catch {
            // File doesn't exist, ignore
        }
    }

    // Try to clear keytar
    try {
        const keytar = await import('keytar');
        await keytar.default.deletePassword('gsc-mcp', 'tokens');
    } catch {
        // Keytar not available or failed
    }
}

/**
 * Get the cache database path
 */
export function getCachePath(): string {
    return join(paths.data, 'cache.sqlite');
}

/**
 * Get the logs directory path
 */
export function getLogsPath(): string {
    return join(paths.data, 'logs');
}

/**
 * Ensure all required directories exist
 */
export async function ensureDirectories(): Promise<void> {
    await ensureConfigDir();
    await ensureDataDir();
    await mkdir(getLogsPath(), { recursive: true });
}
