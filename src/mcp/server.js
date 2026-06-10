import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defaultDeps } from '../deps.js';
import { TOOLS } from './tools.js';
import { DiscordError } from '../lib/errors.js';

export function makeToolHandler(tool, deps) {
  return async (args) => {
    try {
      const result = await tool.command(tool.mapArgs(args || {}), deps);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof DiscordError ? err.message : (err && err.message) || String(err);
      return { content: [{ type: 'text', text: msg }], isError: true };
    }
  };
}

export function buildMcpServer(deps = defaultDeps) {
  const server = new McpServer({ name: 'discord-cli', version: '0.3.0' });
  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, makeToolHandler(t, deps));
  }
  return server;
}

export async function startMcpServer(deps = defaultDeps) {
  const server = buildMcpServer(deps);
  await server.connect(new StdioServerTransport());
}
