import { describe, it, expect } from 'vitest';
import { runAllowList } from '../src/commands/allow.js';

describe('runAllowList', () => {
  it('returns channel and server ids with counts', async () => {
    const deps = { loadAllowlist: () => ({ channels: ['111', '222'], servers: ['999'] }) };
    const r = await runAllowList({}, deps);
    expect(r.channelCount).toBe(2);
    expect(r.channels).toEqual(['111', '222']);
    expect(r.serverCount).toBe(1);
    expect(r.servers).toEqual(['999']);
  });

  it('returns zero for an empty allowlist', async () => {
    const r = await runAllowList({}, { loadAllowlist: () => ({ channels: [], servers: [] }) });
    expect(r.channelCount).toBe(0);
    expect(r.channels).toEqual([]);
    expect(r.serverCount).toBe(0);
    expect(r.servers).toEqual([]);
  });
});
