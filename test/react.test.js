import { describe, it, expect, vi } from 'vitest';
import { runReact } from '../src/commands/react.js';
import { InvalidInputError } from '../src/lib/errors.js';

const deps = (addReaction) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ addReaction }),
});

describe('runReact', () => {
  it('requires channel, message, and emoji', async () => {
    await expect(runReact({ channel: 'general', message: '1' }, deps(vi.fn()))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('reacts on an allowlisted alias', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: 'general', message: '42', emoji: '👍' }, deps(addReaction));
    expect(addReaction).toHaveBeenCalledWith('111111111111111111', '42', '👍');
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '42', emoji: '👍', reacted: true });
  });

  it('reacts on a raw channel id (ungated)', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: '222222222222222222', message: '42', emoji: '🎉' }, deps(addReaction));
    expect(r.channelId).toBe('222222222222222222');
  });
});
