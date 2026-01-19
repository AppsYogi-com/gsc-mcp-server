import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { createInterface } from 'readline';
import open from 'open';
import { createServer } from 'http';
import { URL } from 'url';
import { OAuth2Client } from 'google-auth-library';
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

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            resolve(answer.trim());
        });
    });
}

export async function initCommand(options: InitOptions): Promise<void> {
    const spinner = ora();

    console.log(chalk.bold('\n🔧 GSC-MCP Setup\n'));

    // Check for existing config
    try {
        const existingConfig = await loadConfig();
        if (existingConfig && !options.force) {
            console.log(chalk.yellow('Configuration already exists.'));
            const overwrite = await question('Overwrite existing configuration? (y/N): ');
            if (overwrite.toLowerCase() !== 'y') {
                console.log(chalk.blue('Setup cancelled.'));
                rl.close();
                return;
            }
        }
    } catch {
        // No existing config, continue
    }

    // Service account flow
    if (options.serviceAccount) {
        await setupServiceAccount(options.serviceAccount, options.scope, spinner);
        rl.close();
        return;
    }

    // OAuth flow
    await setupOAuth(options.scope, spinner);
    rl.close();
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

async function setupOAuth(scope: ScopeLevel, spinner: Ora): Promise<void> {
    console.log(chalk.blue('OAuth Setup\n'));
    console.log('You need to create OAuth credentials in Google Cloud Console.');
    console.log('Follow these steps:\n');
    console.log('1. Go to https://console.cloud.google.com/apis/credentials');
    console.log('2. Create a project (or select an existing one)');
    console.log('3. Enable the "Google Search Console API"');
    console.log('4. Create OAuth 2.0 credentials (Desktop application)');
    console.log('5. Copy the Client ID and Client Secret\n');

    const openDocs = await question('Open Google Cloud Console in browser? (Y/n): ');
    if (openDocs.toLowerCase() !== 'n') {
        await open('https://console.cloud.google.com/apis/credentials');
    }

    console.log('');

    const clientId = await question('Enter Client ID: ');
    if (!clientId) {
        console.log(chalk.red('Client ID is required.'));
        return;
    }

    const clientSecret = await question('Enter Client Secret: ');
    if (!clientSecret) {
        console.log(chalk.red('Client Secret is required.'));
        return;
    }

    // Start OAuth flow
    spinner.start('Starting OAuth flow...');

    const port = await findAvailablePort(3333, 3400);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const oauth2Client = new OAuth2Client({
        clientId,
        clientSecret,
        redirectUri,
    });

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES[scope],
        prompt: 'consent',
    });

    spinner.stop();
    console.log(chalk.blue('\nOpening browser for authentication...'));
    console.log(chalk.gray(`If the browser doesn't open, visit:\n${authUrl}\n`));

    try {
        const code = await waitForAuthCode(port);
        spinner.start('Exchanging code for tokens...');

        const { tokens } = await oauth2Client.getToken(code);

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

        // Open browser
        await open(authUrl);
    } catch (error) {
        spinner.fail('Authentication failed');
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
}

async function findAvailablePort(start: number, end: number): Promise<number> {
    const net = await import('net');

    for (let port = start; port <= end; port++) {
        const available = await new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.listen(port, '127.0.0.1', () => {
                server.close(() => resolve(true));
            });
            server.on('error', () => resolve(false));
        });
        if (available) return port;
    }
    throw new Error('No available port found');
}

function waitForAuthCode(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url || '', `http://127.0.0.1:${port}`);

            if (url.pathname === '/callback') {
                const code = url.searchParams.get('code');
                const error = url.searchParams.get('error');

                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>❌ Authentication Failed</h1>
                <p>Error: ${error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
                    server.close();
                    reject(new Error(`OAuth error: ${error}`));
                    return;
                }

                if (code) {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>✅ Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);
                    server.close();
                    resolve(code);
                }
            }
        });

        server.listen(port, '127.0.0.1');

        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error('Authentication timeout'));
        }, 300000);
    });
}
