import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createServer as createHttpServer } from 'http';
import { getAllTools, handleToolCall } from './tools/index.js';
import { getAllResources, handleResourceRead } from './resources/index.js';

interface ServerOptions {
    defaultProperty?: string;
}

interface MCPServer {
    runStdio(): Promise<void>;
    runHttp(port: number): Promise<void>;
}

/**
 * Create the GSC MCP Server
 */
export async function createServer(options: ServerOptions = {}): Promise<MCPServer> {
    const server = new Server(
        {
            name: 'gsc-mcp',
            version: '0.1.0',
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // Register tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const tools = getAllTools();
        return { tools };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<any> => {
        const { name, arguments: args } = request.params;
        return await handleToolCall(name, args || {}, options.defaultProperty);
    });

    // Register resource handlers
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        const resources = await getAllResources();
        return { resources };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    server.setRequestHandler(ReadResourceRequestSchema, async (request): Promise<any> => {
        const { uri } = request.params;
        return await handleResourceRead(uri);
    });

    return {
        async runStdio() {
            const transport = new StdioServerTransport();
            await server.connect(transport);
        },

        async runHttp(port: number) {
            const httpServer = createHttpServer(async (req, res) => {
                // CORS headers
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }

                const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

                // Health check
                if (url.pathname === '/health') {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok', server: 'gsc-mcp' }));
                    return;
                }

                // List tools
                if (url.pathname === '/tools' && req.method === 'GET') {
                    const tools = getAllTools();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ tools }, null, 2));
                    return;
                }

                // List resources
                if (url.pathname === '/resources' && req.method === 'GET') {
                    const resources = await getAllResources();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ resources }, null, 2));
                    return;
                }

                // MCP JSON-RPC endpoint
                if (url.pathname === '/mcp' && req.method === 'POST') {
                    let body = '';
                    req.on('data', (chunk) => (body += chunk));
                    req.on('end', async () => {
                        try {
                            const request = JSON.parse(body);
                            let result;

                            if (request.method === 'tools/list') {
                                result = { tools: getAllTools() };
                            } else if (request.method === 'tools/call') {
                                result = await handleToolCall(
                                    request.params.name,
                                    request.params.arguments || {},
                                    options.defaultProperty
                                );
                            } else if (request.method === 'resources/list') {
                                result = { resources: await getAllResources() };
                            } else if (request.method === 'resources/read') {
                                result = await handleResourceRead(request.params.uri);
                            } else {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: `Unknown method: ${request.method}` }));
                                return;
                            }

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                jsonrpc: '2.0',
                                id: request.id,
                                result,
                            }));
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                jsonrpc: '2.0',
                                error: {
                                    code: -32603,
                                    message: error instanceof Error ? error.message : String(error),
                                },
                            }));
                        }
                    });
                    return;
                }

                // 404
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            });

            return new Promise((resolve) => {
                httpServer.listen(port, '127.0.0.1', () => {
                    resolve();
                });
            });
        },
    };
}
