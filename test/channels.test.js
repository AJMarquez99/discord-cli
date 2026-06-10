import { describe, it, expect, vi } from 'vitest';
import { runChannels } from '../src/commands/channels.js';
import { InvalidInputError } from '../src/lib/errors.js';

const apiChannels = [
  { id: '10', name: 'general', type: 0, parent_id: '99' },
  { id: '11', name: 'voice-1', type: 2, parent_id: '99' },
  { id: '99', name: 'Text Channels', type: 4, parent_id: null },
  { id: '12', name: 'announce', type: 5, parent_id: null },
];

const deps = (over = {}) => ({
  loadAllowlist: () => ({ channels: ['10'], servers: ['77'] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ getGuildChannels: over.getGuildChannels || vi.fn().mockResolvedValue(apiChannels) }),
  ...over,
});

describe('runChannels', () => {
  it('resolves the server from --server', async () => {
    const getGuildChannels = vi.fn().mockResolvedValue(apiChannels);
    const r = await runChannels({ server: '77' }, deps({ getGuildChannels }));
    expect(getGuildChannels).toHaveBeenCalledWith('77');
    expect(r.serverId).toBe('77');
    expect(r.count).toBe(4);
  });

  it('falls back to the single allowlisted server', async () => {
    const getGuildChannels = vi.fn().mockResolvedValue(apiChannels);
    await runChannels({}, deps({ getGuildChannels }));
    expect(getGuildChannels).toHaveBeenCalledWith('77');
  });

  it('errors when no server can be resolved', async () => {
    await expect(runChannels({}, deps({ loadAllowlist: () => ({ channels: [], servers: [] }) })))
      .rejects.toBeInstanceOf(InvalidInputError);
    await expect(runChannels({}, deps({ loadAllowlist: () => ({ channels: [], servers: ['77', '88'] }) })))
      .rejects.toBeInstanceOf(InvalidInputError);
  });

  it('maps types and marks allowlisted channels', async () => {
    const r = await runChannels({ server: '77' }, deps());
    const general = r.channels.find((c) => c.id === '10');
    expect(general).toEqual({ id: '10', name: 'general', type: 'text', parentId: '99', allowlisted: true });
    expect(r.channels.find((c) => c.id === '11').type).toBe('voice');
    expect(r.channels.find((c) => c.id === '99').type).toBe('category');
    expect(r.channels.find((c) => c.id === '12').type).toBe('announcement');
    expect(r.channels.find((c) => c.id === '12').allowlisted).toBe(false);
  });

  it('filters by --type', async () => {
    const r = await runChannels({ server: '77', type: 'text' }, deps());
    expect(r.channels).toHaveLength(1);
    expect(r.channels[0].id).toBe('10');
  });

  it('never fetches message content (only getGuildChannels)', async () => {
    const getMessages = vi.fn();
    await runChannels({ server: '77' }, deps({ createClient: () => ({ getGuildChannels: vi.fn().mockResolvedValue(apiChannels), getMessages }) }));
    expect(getMessages).not.toHaveBeenCalled();
  });
});
