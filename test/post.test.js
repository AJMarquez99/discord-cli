import { describe, it, expect, vi } from 'vitest';
import { runPost } from '../src/commands/post.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  appendAudit: over.appendAudit || vi.fn(),
  now: over.now || (() => '2026-06-09T00:00:00.000Z'),
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

  it('posts to an allowlisted channel with allowed_mentions: { parse: ["users"] }', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const r = await runPost({ channel: '111111111111111111', message: 'hi' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', {
      content: 'hi',
      allowed_mentions: { parse: ['users'] },
    });
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '99' });
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error', async () => {
    await expect(runPost({ channel: '222222222222222222', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('--reply-to sets message_reference and allowed_mentions.replied_user', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi', replyTo: '42' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', {
      content: 'hi',
      allowed_mentions: { parse: ['users'], replied_user: true },
      message_reference: { message_id: '42' },
    });
  });

  it('opts.allowEveryone adds "everyone" to allowed_mentions.parse', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi', allowEveryone: true }, deps({ createMessage }));
    const payload = createMessage.mock.calls[0][1];
    expect(payload.allowed_mentions.parse).toContain('everyone');
  });

  it('posts into a thread when its parent is allowlisted', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const getChannel = vi.fn().mockResolvedValue({ id: 'thread1', parent_id: '111111111111111111' });
    const r = await runPost({ thread: 'thread1', message: 'hi' }, deps({ createMessage, getChannel }));
    expect(getChannel).toHaveBeenCalledWith('thread1');
    expect(createMessage).toHaveBeenCalledWith('thread1', expect.objectContaining({ content: 'hi' }));
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
    expect(createMessage).toHaveBeenCalledWith('999', expect.objectContaining({ content: 'hi' }));
  });

  it('open mode with no servers: a non-allowlisted channel still throws', async () => {
    await expect(runPost({ channel: '999', message: 'hi' }, deps({
      getChannel: vi.fn().mockResolvedValue({ guild_id: '77' }),
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: [] },
    }))).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('a successful post calls appendAudit with ts + entry (no body when logBody false)', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi' }, deps({ appendAudit, createMessage }));
    expect(appendAudit).toHaveBeenCalledOnce();
    const entry = appendAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      ts: '2026-06-09T00:00:00.000Z',
      action: 'post',
      channelId: '111111111111111111',
      messageId: '99',
      mode: 'restricted',
      allowlisted: true,
    });
    expect(entry).not.toHaveProperty('body');
  });

  it('opts.noAudit → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi', noAudit: true }, deps({ appendAudit, createMessage }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('opts.audit === false → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: '111111111111111111', message: 'hi', audit: false }, deps({ appendAudit, createMessage }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('with auditLog.logBody: true, the audit entry includes body', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const config = { mode: 'restricted', auditLog: { enabled: true, logBody: true } };
    await runPost({ channel: '111111111111111111', message: 'hi' }, deps({ appendAudit, createMessage, config }));
    expect(appendAudit.mock.calls[0][0]).toHaveProperty('body', 'hi');
  });

  it('dryRun on an allowlisted channel → returns dryRun result, no createMessage or appendAudit', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn();
    const r = await runPost({ channel: '111111111111111111', message: 'hi', dryRun: true }, deps({ appendAudit, createMessage }));
    expect(r).toMatchObject({
      dryRun: true,
      blocked: false,
      targetChannelId: '111111111111111111',
      allowedMentions: { parse: ['users'] },
    });
    expect(createMessage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('dryRun on a non-allowlisted channel (restricted) → returns blocked result, no throw, no createMessage/appendAudit', async () => {
    const appendAudit = vi.fn();
    const createMessage = vi.fn();
    const r = await runPost({ channel: '222222222222222222', message: 'hi', dryRun: true }, deps({ appendAudit, createMessage }));
    expect(r).toMatchObject({ dryRun: true, blocked: true });
    expect(r.reason).toBeTruthy();
    expect(createMessage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('a real post to a non-allowlisted channel still throws ChannelNotAllowedError', async () => {
    await expect(runPost({ channel: '222222222222222222', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
