import { describe, it, expect, vi } from 'vitest';
import { runThreadCreate } from '../src/commands/thread.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (startThreadFromMessage) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ startThreadFromMessage }),
});

describe('runThreadCreate', () => {
  it('requires channel, from, and name', async () => {
    await expect(runThreadCreate({ channel: 'general', from: '1' }, deps(vi.fn()))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('creates a thread from a message in an allowlisted channel', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    const r = await runThreadCreate({ channel: 'general', from: '42', name: 'topic' }, deps(startThreadFromMessage));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic' });
    expect(r).toMatchObject({ parentChannelId: '111111111111111111', threadId: '50', name: 'topic' });
  });

  it('passes auto_archive_duration when --auto-archive is given', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: 'general', from: '42', name: 'topic', autoArchive: '1440' }, deps(startThreadFromMessage));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic', auto_archive_duration: 1440 });
  });

  it('blocks a non-allowlisted channel', async () => {
    await expect(runThreadCreate({ channel: 'random', from: '42', name: 'topic' }, deps(vi.fn())))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
