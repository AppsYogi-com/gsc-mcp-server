import { google } from 'googleapis';
import { readFile } from 'fs/promises';
import { loadConfig } from './tokenStore.js';
import { SCOPES } from '../types.js';

/**
 * Create an authenticated client using service account credentials
 */
export async function createServiceAccountClient() {
    const config = await loadConfig();

    if (config.authType !== 'service-account') {
        throw new Error('Service account not configured. Run `gsc-mcp init --service-account <path>` to set up.');
    }

    if (!config.serviceAccountPath) {
        throw new Error('Service account path not found in configuration.');
    }

    const keyFileContent = await readFile(config.serviceAccountPath, 'utf-8');
    const keyData = JSON.parse(keyFileContent);

    const auth = new google.auth.GoogleAuth({
        credentials: keyData,
        scopes: SCOPES[config.scope],
    });

    return auth;
}

/**
 * Get the service account email from the key file
 */
export async function getServiceAccountEmail(): Promise<string | null> {
    try {
        const config = await loadConfig();
        if (config.authType !== 'service-account' || !config.serviceAccountPath) {
            return null;
        }

        const keyFileContent = await readFile(config.serviceAccountPath, 'utf-8');
        const keyData = JSON.parse(keyFileContent);
        return keyData.client_email || null;
    } catch {
        return null;
    }
}
