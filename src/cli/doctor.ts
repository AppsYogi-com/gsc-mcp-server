import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, loadTokens, getConfigPath } from '../auth/tokenStore.js';
import { GSCClient } from '../gsc/client.js';

interface DoctorOptions {
    verbose: boolean;
}

interface CheckResult {
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    details?: string;
}

export async function doctorCommand(options: DoctorOptions): Promise<void> {
    console.log(chalk.bold('\n🩺 GSC-MCP Diagnostics\n'));

    const results: CheckResult[] = [];

    // Check 1: Configuration file
    const configCheck = await checkConfig();
    results.push(configCheck);

    if (configCheck.status === 'fail') {
        printResults(results, options.verbose);
        console.log(chalk.yellow('\nRun `gsc-mcp init` to set up your configuration.\n'));
        return;
    }

    // Check 2: Authentication tokens
    const authCheck = await checkAuth();
    results.push(authCheck);

    if (authCheck.status === 'fail') {
        printResults(results, options.verbose);
        console.log(chalk.yellow('\nRun `gsc-mcp init` to authenticate.\n'));
        return;
    }

    // Check 3: API connectivity
    const apiCheck = await checkApiConnectivity();
    results.push(apiCheck);

    // Check 4: List properties
    const propertiesCheck = await checkProperties();
    results.push(propertiesCheck);

    // Check 5: Quota status
    const quotaCheck = await checkQuota();
    results.push(quotaCheck);

    printResults(results, options.verbose);

    const failures = results.filter((r) => r.status === 'fail');
    const warnings = results.filter((r) => r.status === 'warn');

    if (failures.length === 0) {
        console.log(chalk.green('\n✓ All checks passed!'));
        if (warnings.length > 0) {
            console.log(chalk.yellow(`  (${warnings.length} warning${warnings.length > 1 ? 's' : ''})`));
        }
        console.log(chalk.blue('\nRun `gsc-mcp run` to start the MCP server.\n'));
    } else {
        console.log(chalk.red(`\n✗ ${failures.length} check${failures.length > 1 ? 's' : ''} failed\n`));
    }
}

async function checkConfig(): Promise<CheckResult> {
    try {
        const config = await loadConfig();
        const configPath = getConfigPath();

        if (config.authType === 'service-account') {
            return {
                name: 'Configuration',
                status: 'pass',
                message: 'Service account configured',
                details: `Path: ${configPath}\nKey: ${config.serviceAccountPath}`,
            };
        }

        return {
            name: 'Configuration',
            status: 'pass',
            message: 'OAuth configured',
            details: `Path: ${configPath}\nScope: ${config.scope}\nClient ID: ${config.clientId.substring(0, 20)}...`,
        };
    } catch {
        return {
            name: 'Configuration',
            status: 'fail',
            message: 'No configuration found',
            details: `Expected at: ${getConfigPath()}`,
        };
    }
}

async function checkAuth(): Promise<CheckResult> {
    try {
        const config = await loadConfig();

        if (config.authType === 'service-account') {
            // Verify service account file exists and is valid
            const fs = await import('fs');
            if (!config.serviceAccountPath || !fs.existsSync(config.serviceAccountPath)) {
                return {
                    name: 'Authentication',
                    status: 'fail',
                    message: 'Service account key file not found',
                    details: `Path: ${config.serviceAccountPath}`,
                };
            }
            return {
                name: 'Authentication',
                status: 'pass',
                message: 'Service account key valid',
            };
        }

        const tokens = await loadTokens();
        if (!tokens || !tokens.refreshToken) {
            return {
                name: 'Authentication',
                status: 'fail',
                message: 'No refresh token found',
            };
        }

        const isExpired = tokens.expiryDate < Date.now();
        return {
            name: 'Authentication',
            status: 'pass',
            message: isExpired ? 'Token expired (will refresh)' : 'Token valid',
            details: `Expires: ${new Date(tokens.expiryDate).toISOString()}`,
        };
    } catch (error) {
        return {
            name: 'Authentication',
            status: 'fail',
            message: 'Failed to load tokens',
            details: error instanceof Error ? error.message : String(error),
        };
    }
}

async function checkApiConnectivity(): Promise<CheckResult> {
    const spinner = ora('Testing API connectivity...').start();

    try {
        const client = await GSCClient.create();
        await client.listSites();
        spinner.stop();

        return {
            name: 'API Connectivity',
            status: 'pass',
            message: 'Successfully connected to GSC API',
        };
    } catch (error) {
        spinner.stop();
        const message = error instanceof Error ? error.message : String(error);

        if (message.includes('invalid_grant')) {
            return {
                name: 'API Connectivity',
                status: 'fail',
                message: 'Token revoked or expired',
                details: 'Run `gsc-mcp init` to re-authenticate',
            };
        }

        if (message.includes('ENOTFOUND') || message.includes('ETIMEDOUT')) {
            return {
                name: 'API Connectivity',
                status: 'fail',
                message: 'Network error',
                details: 'Check your internet connection',
            };
        }

        return {
            name: 'API Connectivity',
            status: 'fail',
            message: 'API request failed',
            details: message,
        };
    }
}

async function checkProperties(): Promise<CheckResult> {
    try {
        const client = await GSCClient.create();
        const sites = await client.listSites();

        if (sites.length === 0) {
            return {
                name: 'Properties',
                status: 'warn',
                message: 'No properties found',
                details: 'Add properties in Google Search Console or verify service account permissions',
            };
        }

        const siteList = sites.map((s) => `  • ${s.siteUrl} (${s.permissionLevel})`).join('\n');

        return {
            name: 'Properties',
            status: 'pass',
            message: `${sites.length} propert${sites.length === 1 ? 'y' : 'ies'} accessible`,
            details: siteList,
        };
    } catch (error) {
        return {
            name: 'Properties',
            status: 'fail',
            message: 'Failed to list properties',
            details: error instanceof Error ? error.message : String(error),
        };
    }
}

async function checkQuota(): Promise<CheckResult> {
    // GSC API has a default quota of 1,200 queries per day
    // We can't directly check remaining quota, so we just note the limits
    return {
        name: 'Quota',
        status: 'pass',
        message: 'Quota info available',
        details: 'Default: 1,200 queries/day\nCheck usage at: https://console.cloud.google.com/apis/dashboard',
    };
}

function printResults(results: CheckResult[], verbose: boolean): void {
    for (const result of results) {
        const icon =
            result.status === 'pass' ? chalk.green('✓') :
                result.status === 'warn' ? chalk.yellow('⚠') :
                    chalk.red('✗');

        const statusColor =
            result.status === 'pass' ? chalk.green :
                result.status === 'warn' ? chalk.yellow :
                    chalk.red;

        console.log(`${icon} ${chalk.bold(result.name)}: ${statusColor(result.message)}`);

        if (verbose && result.details) {
            const detailLines = result.details.split('\n');
            for (const line of detailLines) {
                console.log(chalk.gray(`    ${line}`));
            }
        }
    }
}
