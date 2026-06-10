import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('package', () => {
  it('declares the discord + discord-mcp bins and is ESM', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.bin.discord).toBe('./bin/discord.js');
    expect(pkg.bin['discord-mcp']).toBe('./bin/discord-mcp.js');
  });
});
