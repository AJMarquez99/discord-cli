import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('package', () => {
  it('declares the discord bin and is ESM', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.bin.discord).toBe('./bin/discord.js');
  });
});
