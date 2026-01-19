import chalk from 'chalk';
import { createServer } from '../server/index.js';

interface RunOptions {
    http?: string;
    property?: string;
}

export async function runCommand(options: RunOptions): Promise<void> {
    if (options.http) {
        await runHttpMode(parseInt(options.http, 10), options.property);
    } else {
        await runStdioMode(options.property);
    }
}

async function runStdioMode(defaultProperty?: string): Promise<void> {
    // In stdio mode, we don't want to log to stdout as it's used for MCP communication
    // Log to stderr instead
    console.error(chalk.blue('Starting GSC-MCP server in stdio mode...'));

    try {
        const server = await createServer({ defaultProperty });
        await server.runStdio();
    } catch (error) {
        console.error(chalk.red('Failed to start server:'), error);
        process.exit(1);
    }
}

async function runHttpMode(port: number, defaultProperty?: string): Promise<void> {
    console.log(chalk.blue(`Starting GSC-MCP server in HTTP mode on port ${port}...`));
    console.log(chalk.gray('This mode is for debugging only.\n'));

    try {
        const server = await createServer({ defaultProperty });
        await server.runHttp(port);

        console.log(chalk.green(`\n✓ Server running at http://127.0.0.1:${port}`));
        console.log(chalk.gray('\nEndpoints:'));
        console.log(chalk.cyan('  POST /mcp') + ' - MCP JSON-RPC endpoint');
        console.log(chalk.cyan('  GET /health') + ' - Health check');
        console.log(chalk.cyan('  GET /tools') + ' - List available tools');
        console.log(chalk.cyan('  GET /resources') + ' - List available resources\n');
        console.log(chalk.gray('Press Ctrl+C to stop.\n'));
    } catch (error) {
        console.error(chalk.red('Failed to start server:'), error);
        process.exit(1);
    }
}
