import { describe, it, expect } from 'vitest';
import { runAllowList } from '../src/commands/allow.js';

describe('runAllowList', () => {
  it('normalizes entries and counts them', async () => {
    const deps = { loadAllowlist: () => ({ channels: [
      { alias: 'general', channelId: '111', serverId: '999' },
      { channelId: '222' },
      { alias: 'bad' }, // no channelId — dropped
    ] }) };
    const r = await runAllowList({}, deps);
    expect(r.count).toBe(2);
    expect(r.channels[0]).toEqual({ alias: 'general', channelId: '111', serverId: '999' });
    expect(r.channels[1]).toEqual({ alias: null, channelId: '222', serverId: null });
  });

  it('returns zero for an empty allowlist', async () => {
    const r = await runAllowList({}, { loadAllowlist: () => ({ channels: [] }) });
    expect(r.count).toBe(0);
    expect(r.channels).toEqual([]);
  });
});
