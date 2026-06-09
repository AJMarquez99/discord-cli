import { describe, it, expect, vi } from 'vitest';
import { runRead } from '../src/commands/read.js';
import { InvalidInputError } from '../src/lib/errors.js';

const apiMessages = [
  { id: 'a', author: { id: 'u1', username: 'alice', global_name: 'Alice' }, content: 'hello', timestamp: 't1',
    reactions: [{ emoji: { name: '👍' }, count: 2 }], attachments: [] },
];

const deps = (getMessages) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ getMessages }),
});

describe('runRead', () => {
  it('requires --channel', async () => {
    await expect(runRead({}, deps(async () => []))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('resolves an alias and returns shaped messages', async () => {
    const getMessages = vi.fn().mockResolvedValue(apiMessages);
    const r = await runRead({ channel: 'general', limit: '5' }, deps(getMessages));
    expect(getMessages).toHaveBeenCalledWith('111111111111111111', { limit: 5, before: undefined, after: undefined });
    expect(r.count).toBe(1);
    expect(r.messages[0]).toMatchObject({ id: 'a', author: 'Alice', content: 'hello' });
    expect(r.messages[0].reactions).toEqual([{ emoji: '👍', count: 2 }]);
  });

  it('accepts a raw channel id (ungated)', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    const r = await runRead({ channel: '222222222222222222' }, deps(getMessages));
    expect(r.channelId).toBe('222222222222222222');
    expect(getMessages).toHaveBeenCalledWith('222222222222222222', { limit: 25, before: undefined, after: undefined });
  });

  it('caps limit at 100 and floors invalid values to 25', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    await runRead({ channel: '222222222222222222', limit: '500' }, deps(getMessages));
    expect(getMessages.mock.calls[0][1].limit).toBe(100);
    await runRead({ channel: '222222222222222222', limit: 'abc' }, deps(getMessages));
    expect(getMessages.mock.calls[1][1].limit).toBe(25);
  });

  it('rejects an unknown alias with a config error', async () => {
    await expect(runRead({ channel: 'mystery' }, deps(async () => []))).rejects.toBeInstanceOf(InvalidInputError);
  });
});
