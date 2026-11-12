import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { createInterface, type Interface } from 'readline';
import open from 'open';
import { randomBytes } from 'crypto';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import {
    saveConfig,
    saveTokens,
    loadConfig,
    getConfigPath,
} from '../auth/tokenStore.js';
import { SCOPES, type ScopeLevel } from '../types.js';

interface InitOptions {
    serviceAccount?: string;
    scope: ScopeLevel;
    force: boolean;
}

/** How long `init` waits for the browser sign-in before giving up. */
export const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

type Ask = (prompt: string) => Promise<string>;

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function initCommand(options: InitOptions): Promise<void> {
    const spinner = ora();
    // Created here, not at import time: every CLI command imports this module, and `run` must
    // leave stdin to the MCP transport.
    const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
    const ask: Ask = (prompt) => new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer.trim())));

    try {
        console.log(chalk.bold('\n🔧 GSC-MCP Setup\n'));

        // Check for existing config
        try {
            const existingConfig = await loadConfig();
            if (existingConfig && !options.force) {
                console.log(chalk.yellow('Configuration already exists.'));
                const overwrite = await ask('Overwrite existing configuration? (y/N): ');
                if (overwrite.toLowerCase() !== 'y') {
                    console.log(chalk.blue('Setup cancelled.'));
                    return;
                }
            }
        } catch {
            // No existing config, continue
        }

        if (options.serviceAccount) {
            await setupServiceAccount(options.serviceAccount, options.scope, spinner);
            return;
        }

        await setupOAuth(options.scope, spinner, ask);
    } finally {
        rl.close();
    }
}

async function setupServiceAccount(
    keyPath: string,
    scope: ScopeLevel,
    spinner: Ora
): Promise<void> {
    spinner.start('Validating service account key...');

    try {
        const fs = await import('fs');
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf-8'));

        if (!keyData.client_email || !keyData.private_key) {
            spinner.fail('Invalid service account key file');
            console.log(chalk.red('The file must contain client_email and private_key fields.'));
            return;
        }

        spinner.succeed('Service account key validated');

        await saveConfig({
            clientId: keyData.client_id || '',
            clientSecret: '',
            authType: 'service-account',
            serviceAccountPath: keyPath,
            scope,
        });

        console.log(chalk.green('\n✓ Service account configured successfully!\n'));
        console.log(chalk.yellow('Important:'), 'Make sure to add the service account email as an owner');
        console.log('in Google Search Console for each property you want to access:');
        console.log(chalk.cyan(`  ${keyData.client_email}\n`));
        console.log('Next steps:');
        console.log(chalk.cyan('  gsc-mcp doctor') + ' - Verify the setup');
        console.log(chalk.cyan('  gsc-mcp run') + '    - Start the MCP server\n');
    } catch (error) {
        spinner.fail('Failed to read service account key');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
}

async function setupOAuth(scope: ScopeLevel, spinner: Ora, ask: Ask): Promise<void> {
    console.log(chalk.blue('OAuth Setup\n'));
    console.log('You need to create OAuth credentials in Google Cloud Console.');
    console.log('Follow these steps:\n');
    console.log('1. Go to https://console.cloud.google.com/apis/credentials');
    console.log('2. Create a project (or select an existing one)');
    console.log('3. Enable the "Google Search Console API"');
    console.log('4. Create OAuth 2.0 credentials (Desktop application)');
    console.log('5. Copy the Client ID and Client Secret\n');

    const openDocs = await ask('Open Google Cloud Console in browser? (Y/n): ');
    if (openDocs.toLowerCase() !== 'n') {
        openInBrowser('https://console.cloud.google.com/apis/credentials');
    }

    console.log('');

    const clientId = await ask('Enter Client ID: ');
    if (!clientId) {
        console.log(chalk.red('Client ID is required.'));
        return;
    }

    const clientSecret = await ask('Enter Client Secret: ');
    if (!clientSecret) {
        console.log(chalk.red('Client Secret is required.'));
        return;
    }

    const state = randomBytes(16).toString('hex');
    let receiver: LoopbackReceiver | undefined;

    try {
        receiver = await startLoopbackReceiver({ state });
        const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri: receiver.redirectUri });
        const { authUrl, codeVerifier } = await buildAuthUrl(oauth2Client, scope, state);

        console.log(chalk.blue('\nOpening your browser to sign in. If it does not open, visit:\n'));
        console.log(authUrl);
        console.log(chalk.gray('\n("redirect_uri_mismatch" means your OAuth client is not a "Desktop app" client.)\n'));
        openInBrowser(authUrl);

        spinner.start(`Waiting for Google to redirect to ${receiver.redirectUri} (5 minutes)...`);
        const code = await receiver.waitForCode();
        spinner.text = 'Exchanging code for tokens...';

        const { tokens } = await oauth2Client.getToken({
            code,
            codeVerifier,
            redirect_uri: receiver.redirectUri,
        });

        if (!tokens.refresh_token) {
            spinner.fail('No refresh token received');
            console.log(chalk.red('Please try again and make sure to grant offline access.'));
            return;
        }

        await saveConfig({
            clientId,
            clientSecret,
            authType: 'oauth',
            scope,
        });

        await saveTokens({
            accessToken: tokens.access_token || '',
            refreshToken: tokens.refresh_token,
            expiryDate: tokens.expiry_date || Date.now() + 3600000,
        });

        spinner.succeed('Authentication successful!');

        console.log(chalk.green('\n✓ GSC-MCP configured successfully!\n'));
        console.log('Configuration saved to:', chalk.cyan(getConfigPath()));
        console.log('\nNext steps:');
        console.log(chalk.cyan('  gsc-mcp doctor') + ' - Verify the setup');
        console.log(chalk.cyan('  gsc-mcp run') + '    - Start the MCP server\n');
    } catch (error) {
        spinner.fail('Authentication failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    } finally {
        receiver?.close();
    }
}

/** Open a URL in the default browser without failing (or crashing) if no browser is available. */
function openInBrowser(url: string): void {
    open(url)
        .then((child) => child.on('error', () => undefined))
        .catch(() => undefined);
}

/** Build the Google consent URL with PKCE (S256) and the `state` value the callback must echo. */
export async function buildAuthUrl(
    client: OAuth2Client,
    scope: ScopeLevel,
    state: string
): Promise<{ authUrl: string; codeVerifier: string }> {
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES[scope],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
    });
    return { authUrl, codeVerifier };
}

export interface LoopbackReceiver {
    /** `http://127.0.0.1:<port>/callback`, the redirect URI to register with the OAuth request. */
    redirectUri: string;
    /** Resolves with the authorization code; rejects on an OAuth error, a state mismatch or a timeout. */
    waitForCode(): Promise<string>;
    /** Stop the timer and the server, dropping any open (keep-alive) browser connections. */
    close(): void;
}

/**
 * Listen on 127.0.0.1 for Google's OAuth redirect (the loopback flow for Desktop-app clients).
 * The port defaults to one the OS picks. Always call `close()` when done, or the process keeps running.
 */
export async function startLoopbackReceiver(options: {
    state: string;
    port?: number;
    timeoutMs?: number;
}): Promise<LoopbackReceiver> {
    const { state, port = 0, timeoutMs = AUTH_TIMEOUT_MS } = options;
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;

    let timer: NodeJS.Timeout | undefined;
    const code = new Promise<string>((resolve, reject) => {
        timer = setTimeout(
            () => reject(new Error('Timed out waiting for sign-in (5 minutes). Run `gsc-mcp init` again.')),
            timeoutMs
        );

        server.on('request', (req, res) => {
            const url = new URL(req.url ?? '/', 'http://127.0.0.1');
            const codeParam = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (url.pathname !== '/callback' || (!codeParam && !error)) {
                res.writeHead(404).end();
                return;
            }

            const reply = (status: number, title: string, detail: string) => {
                res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
                res.end(
                    '<!doctype html><html><body style="font-family: system-ui; padding: 40px; text-align: center;">' +
                    `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>` +
                    '<p>You can close this window and return to the terminal.</p></body></html>'
                );
            };

            if (error) {
                reply(400, '❌ Authentication Failed', `Error: ${error}`);
                reject(new Error(`OAuth error: ${error}`));
            } else if (url.searchParams.get('state') !== state) {
                reply(400, '❌ Authentication Failed', 'The sign-in response did not match this request (state mismatch).');
                reject(new Error('State mismatch in the OAuth callback. Please run `gsc-mcp init` again.'));
            } else {
                reply(200, '✅ Authentication Successful!', 'GSC-MCP is authorized.');
                resolve(codeParam!);
            }
        });
    });
    // Rejections are delivered through waitForCode(); don't report them as unhandled if close() comes first.
    code.catch(() => undefined);

    return {
        redirectUri,
        waitForCode: () => code,
        close: () => {
            if (timer) clearTimeout(timer);
            server.closeAllConnections?.();
            server.close();
        },
    };
}
