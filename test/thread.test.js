import { describe, it, expect, vi } from 'vitest';
import { runThreadCreate } from '../src/commands/thread.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (over = {}) => ({
  loadAllowlist: () => over.allowlist || { channels: ['111111111111111111'], servers: [] },
  loadConfig: () => over.config || ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
  resolveCredentials: () => ({ botToken: 'tok' }),
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
});
