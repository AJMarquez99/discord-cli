import { describe, it, expect, vi } from 'vitest';
import { runPost } from '../src/commands/post.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
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
    await expect(runPost({ channel: '111111111111111111', message: '   ' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('posts to an allowlisted channel', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const r = await runPost({ channel: '111111111111111111', message: 'hi' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', { content: 'hi' });
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '99' });
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error', async () => {
    await expect(runPost({ channel: '222222222222222222', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('adds message_reference when --reply-to is given', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi', replyTo: '42' }, deps({ createMessage }));
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

  it('open mode: posts to a non-allowlisted channel whose guild is allowlisted', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const getChannel = vi.fn().mockResolvedValue({ guild_id: '77' });
    const r = await runPost({ channel: '999', message: 'hi' }, deps({
      createMessage,
      getChannel,
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: ['77'] },
    }));
    expect(r.channelId).toBe('999');
    expect(createMessage).toHaveBeenCalledWith('999', { content: 'hi' });
  });

  it('open mode with no servers: a non-allowlisted channel still throws', async () => {
    await expect(runPost({ channel: '999', message: 'hi' }, deps({
      getChannel: vi.fn().mockResolvedValue({ guild_id: '77' }),
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: [] },
    }))).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
