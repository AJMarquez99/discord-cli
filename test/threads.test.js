import { describe, it, expect, vi } from 'vitest';
import { runThreads } from '../src/commands/threads.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const CH = '111111111111111111';
const OTHER = '222222222222222222';
const GUILD = '777777777777777777';
const RESTRICTED = { mode: 'restricted', auditLog: { enabled: true, logBody: false } };
const OPEN = { mode: 'open', auditLog: { enabled: true, logBody: false } };

const thread = (id, parent, over = {}) => ({
  id, name: `thread ${id}`, parent_id: parent,
  thread_metadata: { archived: false, locked: false, create_timestamp: '2026-01-01T00:00:00.000Z' },
  message_count: 3, last_message_id: '1000000000000000000', applied_tags: [], ...over,
});

const make = (over = {}) => {
  const client = {
    getActiveThreads: over.getActiveThreads || vi.fn().mockResolvedValue({ threads: [], members: [] }),
    getArchivedThreads: over.getArchivedThreads || vi.fn().mockResolvedValue({ threads: [], members: [], has_more: false }),
    getChannel: over.getChannel || vi.fn().mockResolvedValue({ id: CH, guild_id: GUILD, available_tags: [] }),
    getMessages: vi.fn(),
  };
  return {
    client,
    deps: {
      loadAllowlist: () => over.allowlist || { channels: [CH], servers: [] },
      loadConfig: () => over.config || RESTRICTED,
      resolveCredentials: () => ({ botToken: 'tok' }),
      createClient: () => client,
    },
  };
};

describe('runThreads --channel', () => {
  it('returns only the channel parent threads from the active list', async () => {
    const getActiveThreads = vi.fn().mockResolvedValue({ threads: [thread('1', CH), thread('2', OTHER)] });
    const { deps, client } = make({ getActiveThreads });
    const r = await runThreads({ channel: CH }, deps);
    expect(getActiveThreads).toHaveBeenCalledWith(GUILD);
    expect(r).toMatchObject({ channelId: CH, serverId: GUILD, archived: false, count: 1, filtered: 0, hasMore: false });
    expect(r.threads[0].id).toBe('1');
    expect(client.getMessages).not.toHaveBeenCalled();
  });

  it('forum with zero posts yields count 0', async () => {
    const { deps } = make();
    const r = await runThreads({ channel: CH }, deps);
    expect(r.count).toBe(0);
    expect(r.threads).toEqual([]);
  });

  it('maps applied_tags to names, unknown ids pass through', async () => {
    const { deps } = make({
      getActiveThreads: vi.fn().mockResolvedValue({ threads: [thread('1', CH, { applied_tags: ['t1', 't9'] })] }),
      getChannel: vi.fn().mockResolvedValue({ guild_id: GUILD, available_tags: [{ id: 't1', name: 'bug' }] }),
    });
    const r = await runThreads({ channel: CH }, deps);
    expect(r.threads[0].tags).toEqual(['bug', 't9']);
  });

  it('row shape, createdAt snowflake fallback and lastMessageAt decode', async () => {
    const t = thread('1000000000000000000', CH, { thread_metadata: { archived: true, locked: true }, last_message_id: undefined });
    const t2 = thread('3', CH);
    const { deps } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads: [t, t2] }) });
    const r = await runThreads({ channel: CH }, deps);
    expect(Object.keys(r.threads[0])).toEqual(['id', 'name', 'parentId', 'archived', 'locked', 'messageCount', 'createdAt', 'lastMessageAt', 'archivedAt', 'tags', 'allowlisted']);
    expect(r.threads[0]).toMatchObject({ archived: true, locked: true, lastMessageAt: null, allowlisted: true, tags: [] });
    expect(r.threads[0].createdAt).toMatch(/^20\d\d-/);
    expect(r.threads[1].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(r.threads[1].lastMessageAt).toMatch(/^20\d\d-/);
  });

  it('maps archivedAt from thread_metadata.archive_timestamp, null when absent', async () => {
    const a = thread('4', CH, { thread_metadata: { archived: true, archive_timestamp: '2026-02-03T04:05:06.000Z' } });
    const b = thread('5', CH, { thread_metadata: { archived: true } });
    const { deps } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads: [a, b] }) });
    const r = await runThreads({ channel: CH }, deps);
    expect(r.threads[0].archivedAt).toBe('2026-02-03T04:05:06.000Z');
    expect(r.threads[1].archivedAt).toBeNull();
  });

  it('archivedAt is null for an active thread even when archive_timestamp is set', async () => {
    const t = thread('6', CH, { thread_metadata: { archived: false, archive_timestamp: '2026-02-03T04:05:06.000Z' } });
    const { deps } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads: [t] }) });
    const r = await runThreads({ channel: CH }, deps);
    expect(r.threads[0].archivedAt).toBeNull();
  });

  it('open mode: channel and its guild both off the allowlist is rejected before listing', async () => {
    const { deps, client } = make({ config: OPEN, allowlist: { channels: [], servers: [OTHER] } });
    await expect(runThreads({ channel: CH }, deps)).rejects.toBeInstanceOf(ChannelNotAllowedError);
    expect(client.getActiveThreads).not.toHaveBeenCalled();
    expect(client.getArchivedThreads).not.toHaveBeenCalled();
  });

  it('archived forwards before+limit and reports hasMore', async () => {
    const getArchivedThreads = vi.fn().mockResolvedValue({ threads: [thread('1', CH)], has_more: true });
    const { deps } = make({ getArchivedThreads });
    const r = await runThreads({ channel: CH, archived: true, before: '2026-01-01T00:00:00Z', limit: '10' }, deps);
    expect(getArchivedThreads).toHaveBeenCalledWith(CH, { before: '2026-01-01T00:00:00Z', limit: 10 });
    expect(r.hasMore).toBe(true);
    expect(r.archived).toBe(true);
  });

  it('query is case-insensitive and limit applies after filtering', async () => {
    const threads = ['Alpha', 'beta', 'ALPHA two', 'alpha three'].map((n, i) => thread(String(i + 1), CH, { name: n }));
    const { deps } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads }) });
    const r = await runThreads({ channel: CH, query: 'alpha', limit: '2' }, deps);
    expect(r.threads.map((t) => t.name)).toEqual(['Alpha', 'ALPHA two']);
    expect(r.count).toBe(2);
  });

  it('limit clamps to 100 max and 25 for invalid', async () => {
    const threads = Array.from({ length: 150 }, (_, i) => thread(String(i + 1), CH));
    const { deps } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads }) });
    expect((await runThreads({ channel: CH, limit: '500' }, deps)).count).toBe(100);
    expect((await runThreads({ channel: CH, limit: 'abc' }, deps)).count).toBe(25);
    expect((await runThreads({ channel: CH }, deps)).count).toBe(25);
  });

  it('restricted non-allowlisted channel is blocked before any thread call', async () => {
    const { deps, client } = make();
    await expect(runThreads({ channel: OTHER }, deps)).rejects.toBeInstanceOf(ChannelNotAllowedError);
    expect(client.getActiveThreads).not.toHaveBeenCalled();
    expect(client.getArchivedThreads).not.toHaveBeenCalled();
  });

  it('open mode with allowlisted server passes for an unlisted channel', async () => {
    const { deps } = make({
      config: OPEN, allowlist: { channels: [], servers: [GUILD] },
      getActiveThreads: vi.fn().mockResolvedValue({ threads: [thread('1', OTHER)] }),
      getChannel: vi.fn().mockResolvedValue({ guild_id: GUILD, available_tags: [] }),
    });
    const r = await runThreads({ channel: OTHER }, deps);
    expect(r.count).toBe(1);
    expect(r.threads[0].allowlisted).toBe(false);
  });
});

describe('runThreads --server', () => {
  const threads = [thread('1', CH), thread('2', OTHER), thread('3', OTHER)];

  it('restricted keeps only allowlisted parents and counts filtered', async () => {
    const { deps, client } = make({ getActiveThreads: vi.fn().mockResolvedValue({ threads }) });
    const r = await runThreads({ server: GUILD }, deps);
    expect(r).toMatchObject({ channelId: null, serverId: GUILD, count: 1, filtered: 2, hasMore: false });
    expect(client.getMessages).not.toHaveBeenCalled();
  });

  it('open + allowlisted server keeps all', async () => {
    const { deps } = make({ config: OPEN, allowlist: { channels: [CH], servers: [GUILD] }, getActiveThreads: vi.fn().mockResolvedValue({ threads }) });
    const r = await runThreads({ server: GUILD }, deps);
    expect(r.count).toBe(3);
    expect(r.filtered).toBe(0);
  });

  it('open + non-allowlisted server keeps only allowlisted-channel parents', async () => {
    const { deps } = make({ config: OPEN, allowlist: { channels: [CH], servers: ['888'] }, getActiveThreads: vi.fn().mockResolvedValue({ threads }) });
    const r = await runThreads({ server: GUILD }, deps);
    expect(r.count).toBe(1);
    expect(r.filtered).toBe(2);
  });

  it('fetches each distinct parent once for tag names', async () => {
    const tagged = [thread('1', CH, { applied_tags: ['t1'] }), thread('2', CH, { applied_tags: ['t1'] }), thread('3', CH)];
    const getChannel = vi.fn().mockResolvedValue({ available_tags: [{ id: 't1', name: 'bug' }] });
    const { deps } = make({ getChannel, getActiveThreads: vi.fn().mockResolvedValue({ threads: tagged }) });
    const r = await runThreads({ server: GUILD }, deps);
    expect(getChannel).toHaveBeenCalledTimes(1);
    expect(getChannel).toHaveBeenCalledWith(CH);
    expect(r.threads[0].tags).toEqual(['bug']);
  });
});

describe('runThreads input errors', () => {
  it('neither with 0 servers errors', async () => {
    const { deps } = make({ allowlist: { channels: [], servers: [] } });
    await expect(runThreads({}, deps)).rejects.toBeInstanceOf(InvalidInputError);
  });
  it('neither with 2+ servers errors naming them', async () => {
    const { deps } = make({ allowlist: { channels: [], servers: ['1', '2'] } });
    await expect(runThreads({}, deps)).rejects.toThrow(/1, 2/);
  });
  it('both channel and server errors', async () => {
    const { deps } = make();
    await expect(runThreads({ channel: CH, server: GUILD }, deps)).rejects.toBeInstanceOf(InvalidInputError);
  });
  it('archived without channel errors', async () => {
    const { deps } = make();
    await expect(runThreads({ server: GUILD, archived: true }, deps)).rejects.toBeInstanceOf(InvalidInputError);
  });
  it('before without archived errors', async () => {
    const { deps } = make();
    await expect(runThreads({ channel: CH, before: '2026-01-01T00:00:00Z' }, deps)).rejects.toThrow(/--before requires --archived/);
  });
  it('single allowlisted server is the default', async () => {
    const getActiveThreads = vi.fn().mockResolvedValue({ threads: [] });
    const { deps } = make({ allowlist: { channels: [], servers: [GUILD] }, getActiveThreads });
    const r = await runThreads({}, deps);
    expect(getActiveThreads).toHaveBeenCalledWith(GUILD);
    expect(r.serverId).toBe(GUILD);
  });
});
