import { describe, it, expect, vi } from 'vitest';
import { runReact } from '../src/commands/react.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  appendAudit: over.appendAudit || vi.fn(),
  now: over.now || (() => '2026-06-09T00:00:00.000Z'),
  createClient: () => ({
    addReaction: over.addReaction || vi.fn(),
    getChannel: over.getChannel || (async () => ({})),
  }),
});

describe('runReact', () => {
  it('requires channel, message, and emoji', async () => {
    await expect(runReact({ channel: '111111111111111111', message: '1' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('reacts on an allowlisted channel', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: '111111111111111111', message: '42', emoji: '👍' }, deps({ addReaction }));
    expect(addReaction).toHaveBeenCalledWith('111111111111111111', '42', '👍');
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '42', emoji: '👍', reacted: true });
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error (restricted)', async () => {
    await expect(runReact({ channel: '222222222222222222', message: '42', emoji: '🎉' }, deps()))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('open mode: reacts on a non-allowlisted channel whose guild is allowlisted', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: '999', message: '42', emoji: '🎉' }, deps({
      addReaction,
      config: { mode: 'open', auditLog: { enabled: true, logBody: false } },
      allowlist: { channels: [], servers: ['77'] },
      getChannel: async () => ({ guild_id: '77' }),
    }));
    expect(r.channelId).toBe('999');
    expect(addReaction).toHaveBeenCalledWith('999', '42', '🎉');
  });

  it('a successful react calls appendAudit with ts + entry', async () => {
    const appendAudit = vi.fn();
    const addReaction = vi.fn().mockResolvedValue(null);
    await runReact({ channel: '111111111111111111', message: '42', emoji: '👍' }, deps({ appendAudit, addReaction }));
    expect(appendAudit).toHaveBeenCalledOnce();
    const entry = appendAudit.mock.calls[0][0];
    expect(entry).toMatchObject({
      ts: '2026-06-09T00:00:00.000Z',
      action: 'react',
      channelId: '111111111111111111',
      messageId: '42',
      emoji: '👍',
      mode: 'restricted',
      allowlisted: true,
    });
  });

  it('opts.noAudit → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const addReaction = vi.fn().mockResolvedValue(null);
    await runReact({ channel: '111111111111111111', message: '42', emoji: '👍', noAudit: true }, deps({ appendAudit, addReaction }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('opts.audit === false → appendAudit NOT called', async () => {
    const appendAudit = vi.fn();
    const addReaction = vi.fn().mockResolvedValue(null);
    await runReact({ channel: '111111111111111111', message: '42', emoji: '👍', audit: false }, deps({ appendAudit, addReaction }));
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('dryRun on an allowlisted channel → returns dryRun result, no addReaction or appendAudit', async () => {
    const appendAudit = vi.fn();
    const addReaction = vi.fn();
    const r = await runReact({ channel: '111111111111111111', message: '42', emoji: '👍', dryRun: true }, deps({ appendAudit, addReaction }));
    expect(r).toMatchObject({ dryRun: true, blocked: false, targetChannelId: '111111111111111111', messageId: '42', emoji: '👍' });
    expect(addReaction).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('dryRun on a non-allowlisted channel → returns blocked result, no throw, no addReaction/appendAudit', async () => {
    const appendAudit = vi.fn();
    const addReaction = vi.fn();
    const r = await runReact({ channel: '222222222222222222', message: '42', emoji: '🎉', dryRun: true }, deps({ appendAudit, addReaction }));
    expect(r).toMatchObject({ dryRun: true, blocked: true });
    expect(r.reason).toBeTruthy();
    expect(addReaction).not.toHaveBeenCalled();
    expect(appendAudit).not.toHaveBeenCalled();
  });

  it('a real react to a non-allowlisted channel still throws ChannelNotAllowedError', async () => {
    await expect(runReact({ channel: '222222222222222222', message: '42', emoji: '🎉' }, deps()))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
