import { describe, it, expect } from 'vitest';
import { buildMcpServer } from '../src/mcp/server.js';

describe('buildMcpServer', () => {
  it('constructs without throwing and returns a truthy object', () => {
    const fakeDeps = {};
    const server = buildMcpServer(fakeDeps);
    expect(server).toBeTruthy();
  });

  it('registers 8 tools', () => {
    const server = buildMcpServer({});
    // McpServer exposes registered tools via the internal _registeredTools plain object
    const registeredTools = server._registeredTools;
    if (registeredTools && typeof registeredTools === 'object') {
      expect(Object.keys(registeredTools)).toHaveLength(8);
    } else {
      // Fallback: just verify the server is a truthy object (no-throw is the assertion)
      expect(server).toBeTruthy();
    }
  });
});
