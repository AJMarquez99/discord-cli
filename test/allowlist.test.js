import { describe, it, expect, vi } from 'vitest';
import {
  loadAllowlist,
  resolveAllowlistPath,
  isAllowedChannel,
  isAllowedServer,
  isAllowedId,
  gateChannel,
  gateThreadParent,
} from '../src/allowlist.js';
import { MalformedConfigError, ChannelNotAllowedError } from '../src/lib/errors.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveAllowlistPath', () => {
  it('honors DISCORD_ALLOWLIST override', () => {
    expect(resolveAllowlistPath({ DISCORD_ALLOWLIST: '/x/a.json' })).toBe('/x/a.json');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveAllowlistPath({ HOME: '/home/me' })).toBe('/home/me/.config/discord-cli/allowlist.json');
  });
});

describe('loadAllowlist', () => {
  it('returns empty channels/servers when the file is missing (fail-closed)', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: enoent })).toEqual({ channels: [], servers: [] });
  });
  it('reads the { channels, servers } form', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ channels: ['1', '2'], servers: ['77'] }) });
    expect(al).toEqual({ channels: ['1', '2'], servers: ['77'] });
  });
  it('accepts a bare top-level array (channels only, servers empty)', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify(['1', '2']) });
    expect(al).toEqual({ channels: ['1', '2'], servers: [] });
  });
  it('back-compat: v0.1 alias-object entries extract channelId, ignore alias', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ channels: [{ alias: 'g', channelId: '111' }, { channelId: 222 }] }) });
    expect(al.channels).toEqual(['111', '222']);
    expect(al.servers).toEqual([]);
  });
  it('throws MalformedConfigError for malformed JSON content', () => {
    expect(() => loadAllowlist({ env: { HOME: '/h' }, readFile: () => '{ not json' }))
      .toThrow(MalformedConfigError);
  });
  it('returns empty for empty/whitespace-only file', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: () => '   ' })).toEqual({ channels: [], servers: [] });
  });
  it('coerces non-string server ids to strings', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ channels: [], servers: [77, '88'] }) });
    expect(al.servers).toEqual(['77', '88']);
  });
});

describe('isAllowedChannel / isAllowedServer / isAllowedId', () => {
  const al = { channels: ['111'], servers: ['77'] };
  it('isAllowedChannel reflects channel membership (string coercion)', () => {
    expect(isAllowedChannel(al, '111')).toBe(true);
    expect(isAllowedChannel(al, 111)).toBe(true);
    expect(isAllowedChannel(al, '999')).toBe(false);
  });
  it('isAllowedServer reflects server membership', () => {
    expect(isAllowedServer(al, '77')).toBe(true);
    expect(isAllowedServer(al, '88')).toBe(false);
  });
  it('isAllowedId is an alias of isAllowedChannel', () => {
    expect(isAllowedId).toBe(isAllowedChannel);
  });
});

describe('gateChannel — restricted mode', () => {
  const allowlist = { channels: ['111'], servers: [] };
  it('allows an allowlisted id with no getChannel call', async () => {
    const client = { getChannel: vi.fn() };
    const r = await gateChannel({ channelId: '111', mode: 'restricted', allowlist, client });
    expect(r).toEqual({ channelId: '111', allowlisted: true });
    expect(client.getChannel).not.toHaveBeenCalled();
  });
  it('throws ChannelNotAllowedError for a non-allowlisted id', async () => {
    const client = { getChannel: vi.fn() };
    await expect(gateChannel({ channelId: '999', mode: 'restricted', allowlist, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
    expect(client.getChannel).not.toHaveBeenCalled();
  });
});

describe('gateChannel — open mode', () => {
  it('allows an allowlisted id without calling getChannel', async () => {
    const client = { getChannel: vi.fn() };
    const r = await gateChannel({ channelId: '111', mode: 'open', allowlist: { channels: ['111'], servers: ['77'] }, client });
    expect(r).toEqual({ channelId: '111', allowlisted: true });
    expect(client.getChannel).not.toHaveBeenCalled();
  });
  it('allows a non-allowlisted id whose guild is allowlisted (allowlisted:false)', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ guild_id: '77' }) };
    const r = await gateChannel({ channelId: '999', mode: 'open', allowlist: { channels: [], servers: ['77'] }, client });
    expect(r).toEqual({ channelId: '999', allowlisted: false });
    expect(client.getChannel).toHaveBeenCalledWith('999');
  });
  it('throws when the channel guild is not allowlisted', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ guild_id: '88' }) };
    await expect(gateChannel({ channelId: '999', mode: 'open', allowlist: { channels: [], servers: ['77'] }, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
  it('throws when servers is empty', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ guild_id: '77' }) };
    await expect(gateChannel({ channelId: '999', mode: 'open', allowlist: { channels: [], servers: [] }, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});

describe('gateThreadParent — restricted mode', () => {
  it('allows a thread whose parent is allowlisted', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ id: 't', parent_id: '111' }) };
    const r = await gateThreadParent({ threadId: 't', mode: 'restricted', allowlist: { channels: ['111'], servers: [] }, client });
    expect(r).toEqual({ channelId: 't', allowlisted: true, parentId: '111' });
  });
  it('throws when the parent is not allowlisted', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ id: 't', parent_id: '999' }) };
    await expect(gateThreadParent({ threadId: 't', mode: 'restricted', allowlist: { channels: ['111'], servers: [] }, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
  it('throws when the thread has no parent_id', async () => {
    const client = { getChannel: vi.fn().mockResolvedValue({ id: 't' }) };
    await expect(gateThreadParent({ threadId: 't', mode: 'restricted', allowlist: { channels: ['111'], servers: [] }, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});

describe('gateThreadParent — open mode', () => {
  it('allows a thread whose parent guild is allowlisted', async () => {
    const client = {
      getChannel: vi.fn()
        .mockResolvedValueOnce({ id: 't', parent_id: '999' }) // thread
        .mockResolvedValueOnce({ id: '999', guild_id: '77' }), // parent
    };
    const r = await gateThreadParent({ threadId: 't', mode: 'open', allowlist: { channels: [], servers: ['77'] }, client });
    expect(r).toEqual({ channelId: 't', allowlisted: false, parentId: '999' });
  });
  it('throws when the parent guild is not allowlisted', async () => {
    const client = {
      getChannel: vi.fn()
        .mockResolvedValueOnce({ id: 't', parent_id: '999' })
        .mockResolvedValueOnce({ id: '999', guild_id: '88' }),
    };
    await expect(gateThreadParent({ threadId: 't', mode: 'open', allowlist: { channels: [], servers: ['77'] }, client }))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
