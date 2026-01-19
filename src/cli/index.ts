#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './init.js';
import { doctorCommand } from './doctor.js';
import { runCommand } from './run.js';

const program = new Command();

program
    .name('gsc-mcp')
    .description('Google Search Console MCP Server - Connect GSC to Claude, Cursor, and other MCP clients')
    .version('0.1.0');

program
    .command('init')
    .description('Initialize GSC-MCP with your Google OAuth credentials')
    .option('--service-account <path>', 'Path to service account JSON key file')
    .option('--scope <scope>', 'Permission scope: "readonly" (default) or "full"', 'readonly')
    .option('--force', 'Overwrite existing configuration', false)
    .action(initCommand);

program
    .command('doctor')
    .description('Check configuration, authentication, and API connectivity')
    .option('--verbose', 'Show detailed diagnostic information', false)
    .action(doctorCommand);

program
    .command('run')
    .description('Start the MCP server')
    .option('--http <port>', 'Run in HTTP mode on specified port (for debugging)')
    .option('--property <url>', 'Override default property URL')
    .action(runCommand);

program
    .command('config')
    .description('Show current configuration')
    .action(async () => {
        const { getConfigPath, loadConfig } = await import('../auth/tokenStore.js');
        const configPath = getConfigPath();
        console.log(chalk.blue('Config directory:'), configPath);

        try {
            const config = await loadConfig();
            console.log(chalk.blue('Current configuration:'));
            console.log(JSON.stringify({
                ...config,
                clientSecret: config.clientSecret ? '***' : undefined,
            }, null, 2));
        } catch {
            console.log(chalk.yellow('No configuration found. Run `gsc-mcp init` to set up.'));
        }
    });

program
    .command('logout')
    .description('Remove stored credentials and tokens')
    .action(async () => {
        const { clearCredentials } = await import('../auth/tokenStore.js');
        await clearCredentials();
        console.log(chalk.green('✓ Credentials cleared successfully'));
    });

// Handle unknown commands
program.on('command:*', () => {
    console.error(chalk.red(`Unknown command: ${program.args.join(' ')}`));
    console.log(`Run ${chalk.cyan('gsc-mcp --help')} to see available commands.`);
    process.exit(1);
});

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
    console.log(chalk.bold('\n🔍 GSC-MCP: Google Search Console MCP Server\n'));
    console.log('Quick start:');
    console.log(chalk.cyan('  1. gsc-mcp init') + '     # Set up OAuth credentials');
    console.log(chalk.cyan('  2. gsc-mcp doctor') + '  # Verify everything works');
    console.log(chalk.cyan('  3. gsc-mcp run') + '     # Start the MCP server\n');
    program.help();
}
