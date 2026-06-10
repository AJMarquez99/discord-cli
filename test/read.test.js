import { describe, it, expect, vi } from 'vitest';
import { runRead } from '../src/commands/read.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const apiMessages = [
  { id: 'a', author: { id: 'u1', username: 'alice', global_name: 'Alice' }, content: 'hello', timestamp: 't1',
    reactions: [{ emoji: { name: '👍' }, count: 2 }], attachments: [] },
];

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ getMessages: over.getMessages || (async () => []), getChannel: over.getChannel || (async () => ({})) }),
});

describe('runRead', () => {
  it('requires --channel', async () => {
    await expect(runRead({}, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('reads an allowlisted channel and returns shaped messages', async () => {
    const getMessages = vi.fn().mockResolvedValue(apiMessages);
    const r = await runRead({ channel: '111111111111111111', limit: '5' }, deps({ getMessages }));
    expect(getMessages).toHaveBeenCalledWith('111111111111111111', { limit: 5, before: undefined, after: undefined });
    expect(r.count).toBe(1);
    expect(r.messages[0]).toMatchObject({ id: 'a', author: 'Alice', content: 'hello' });
    expect(r.messages[0].reactions).toEqual([{ emoji: '👍', count: 2 }]);
  });

  it('caps limit at 100 and floors invalid values to 25', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    await runRead({ channel: '111111111111111111', limit: '500' }, deps({ getMessages }));
    expect(getMessages.mock.calls[0][1].limit).toBe(100);
    await runRead({ channel: '111111111111111111', limit: 'abc' }, deps({ getMessages }));
    expect(getMessages.mock.calls[1][1].limit).toBe(25);
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error (restricted)', async () => {
    await expect(runRead({ channel: '222222222222222222' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('open mode: reads a non-allowlisted channel whose guild is allowlisted', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    const r = await runRead({ channel: '999' }, deps({
      getMessages,
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: ['77'] },
      getChannel: async () => ({ guild_id: '77' }),
    }));
    expect(r.channelId).toBe('999');
    expect(getMessages).toHaveBeenCalledWith('999', { limit: 25, before: undefined, after: undefined });
  });

  it('open mode with no servers: a non-allowlisted channel still throws', async () => {
    await expect(runRead({ channel: '999' }, deps({
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: [] },
      getChannel: async () => ({ guild_id: '77' }),
    }))).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
