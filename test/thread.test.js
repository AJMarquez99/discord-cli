import { describe, it, expect, vi } from 'vitest';
import { runThreadCreate } from '../src/commands/thread.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  appendAudit: over.appendAudit || vi.fn(),
  now: over.now || (() => '2026-06-09T00:00:00.000Z'),
  createClient: () => ({
    startThreadFromMessage: over.startThreadFromMessage || vi.fn(),
    getChannel: over.getChannel || (async () => ({})),
  }),
});

describe('runThreadCreate', () => {
  it('requires channel, from, and name', async () => {
    await expect(runThreadCreate({ channel: '111111111111111111', from: '1' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('creates a thread from a message in an allowlisted channel', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    const r = await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic' }, deps({ startThreadFromMessage }));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic' });
    expect(r).toMatchObject({ parentChannelId: '111111111111111111', threadId: '50', name: 'topic' });
  });

  it('passes auto_archive_duration when --auto-archive is given', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic', autoArchive: '1440' }, deps({ startThreadFromMessage }));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic', auto_archive_duration: 1440 });
  });

  it('blocks a non-allowlisted channel', async () => {
    await expect(runThreadCreate({ channel: '222222222222222222', from: '42', name: 'topic' }, deps()))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('a successful thread-create calls appendAudit with ts + entry', async () => {
    const appendAudit = vi.fn();
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic' }, deps({ appendAudit, startThreadFromMessage }));
    expect(appendAudit).toHaveBeenCalledOnce();
    const entry = appendAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      ts: '2026-06-09T00:00:00.000Z',
      action: 'thread',
      channelId: '111111111111111111',
      messageId: '42',
      threadId: '50',
      name: 'topic',
      mode: 'restricted',
      allowlisted: true,
    });
  });

  it('opts.noAudit → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic', noAudit: true }, deps({ appendAudit, startThreadFromMessage }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('opts.audit === false → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic', audit: false }, deps({ appendAudit, startThreadFromMessage }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('dryRun on an allowlisted channel → returns dryRun result, no startThreadFromMessage or appendAudit', async () => {
    const appendAudit = vi.fn();
    const startThreadFromMessage = vi.fn();
    const r = await runThreadCreate({ channel: '111111111111111111', from: '42', name: 'topic', dryRun: true }, deps({ appendAudit, startThreadFromMessage }));
    expect(r).toMatchObject({ dryRun: true, blocked: false, parentChannelId: '111111111111111111', from: '42', name: 'topic' });
    expect(startThreadFromMessage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('dryRun on a non-allowlisted channel → returns blocked result, no throw, no startThreadFromMessage/appendAudit', async () => {
    const appendAudit = vi.fn();
    const startThreadFromMessage = vi.fn();
    const r = await runThreadCreate({ channel: '222222222222222222', from: '42', name: 'topic', dryRun: true }, deps({ appendAudit, startThreadFromMessage }));
    expect(r).toMatchObject({ dryRun: true, blocked: true });
    expect(r.reason).toBeTruthy();
    expect(startThreadFromMessage).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('a real thread-create to a non-allowlisted channel still throws ChannelNotAllowedError', async () => {
    await expect(runThreadCreate({ channel: '222222222222222222', from: '42', name: 'topic' }, deps()))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
