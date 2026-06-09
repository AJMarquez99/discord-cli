import { describe, it, expect, vi } from 'vitest';
import { runPost } from '../src/commands/post.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const allowlist = { channels: [{ alias: 'general', channelId: '111111111111111111' }] };

const deps = (over = {}) => ({
  loadAllowlist: () => allowlist,
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({
    createMessage: over.createMessage || vi.fn().mockResolvedValue({ id: '99', content: 'hi' }),
    getChannel: over.getChannel || vi.fn().mockResolvedValue({ id: 't', parent_id: '111111111111111111' }),
  }),
});

describe('runPost', () => {
  it('requires a target channel or thread', async () => {
    await expect(runPost({ message: 'hi' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('requires non-empty content', async () => {
    await expect(runPost({ channel: 'general', message: '   ' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('posts to an allowlisted alias', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const r = await runPost({ channel: 'general', message: 'hi' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', { content: 'hi' });
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '99' });
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error', async () => {
    await expect(runPost({ channel: 'random', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('blocks a raw channel id not in the allowlist', async () => {
    await expect(runPost({ channel: '222222222222222222', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('adds message_reference when --reply-to is given', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: 'general', message: 'hi', replyTo: '42' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', { content: 'hi', message_reference: { message_id: '42' } });
  });

  it('posts into a thread when its parent is allowlisted', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const getChannel = vi.fn().mockResolvedValue({ id: 'thread1', parent_id: '111111111111111111' });
    const r = await runPost({ thread: 'thread1', message: 'hi' }, deps({ createMessage, getChannel }));
    expect(getChannel).toHaveBeenCalledWith('thread1');
    expect(createMessage).toHaveBeenCalledWith('thread1', { content: 'hi' });
    expect(r.channelId).toBe('thread1');
  });

  it('blocks a thread whose parent is not allowlisted', async () => {
    const getChannel = vi.fn().mockResolvedValue({ id: 'thread1', parent_id: '999999999999999999' });
    await expect(runPost({ thread: 'thread1', message: 'hi' }, deps({ getChannel }))).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
