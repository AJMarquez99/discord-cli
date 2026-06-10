import { describe, it, expect, vi } from 'vitest';
import { runReact } from '../src/commands/react.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ addReaction: over.addReaction || vi.fn(), getChannel: over.getChannel || (async () => ({})) }),
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
});
