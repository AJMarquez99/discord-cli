import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('package', () => {
  it('declares the discord + discord-mcp bins and is ESM', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.bin.discord).toBe('./bin/discord.js');
    expect(pkg.bin['discord-mcp']).toBe('./bin/discord-mcp.js');
  });

  it('is publish-shaped: scoped name, files allowlist, public access', () => {
    expect(pkg.name).toBe('@ajmarquez99/discord-cli');
    expect(pkg.files).toEqual(expect.arrayContaining(['bin/', 'src/', 'README.md', 'LICENSE']));
    expect(pkg.publishConfig).toEqual({ access: 'public' });
    expect(pkg.license).toBe('MIT');
  });

  it('single-sources the version from package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
