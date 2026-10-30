import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../src/cli.js';

function fakeDeps(over = {}) {
  return {
    loadAllowlist: () => ({ channels: ['111111111111111111'], servers: ['77'] }),
    loadConfig: () => ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
    resolveCredentials: () => ({ botToken: 'tok', source: 'env' }),
    appendAudit: vi.fn(),
    readAudit: vi.fn().mockReturnValue({ entries: [] }),
    now: () => '2026-06-09T00:00:00.000Z',
    createClient: () => ({
      getMe: async () => ({ id: '7', username: 'mybot' }),
      createMessage: async () => ({ id: '99', content: 'hi' }),
      getMessages: async () => [],
      addReaction: async () => null,
      getChannel: async () => ({ id: 't', parent_id: '111111111111111111' }),
      startThreadFromMessage: async () => ({ id: '50', name: 'topic' }),
      getGuildChannels: async () => [],
    }),
    ...over,
  };
}

let out, err;
beforeEach(() => {
  process.exitCode = 0;
  out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => { out.mockRestore(); err.mockRestore(); process.exitCode = 0; });

const argv = (...args) => ['node', 'discord', ...args];

describe('cli run()', () => {
  it('doctor prints JSON and exits 0', async () => {
    await run(argv('doctor'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"ok": true');
    expect(process.exitCode).toBe(0);
  });

  it('post to an allowlisted channel succeeds', async () => {
    await run(argv('post', '--channel', '111111111111111111', '--message', 'hi'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"messageId": "99"');
    expect(process.exitCode).toBe(0);
  });

  it('post to a non-allowlisted channel exits 3 and writes nothing to stdout', async () => {
    await run(argv('post', '--channel', 'random', '--message', 'hi'), fakeDeps());
    expect(process.exitCode).toBe(3);
    const stderr = err.mock.calls.map((c) => c[0]).join('');
    expect(stderr).toContain('Blocked by allowlist');
  });

  it('--format table renders a human summary for doctor', async () => {
    await run(argv('--format', 'table', 'doctor'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('status:');
    expect(printed).toContain('mybot');
  });

  it('read maps --limit and prints messages JSON', async () => {
    const getMessages = vi.fn().mockResolvedValue([
      { id: 'a', author: { username: 'alice' }, content: 'hello', timestamp: 't1' },
    ]);
    await run(argv('read', '--channel', '111111111111111111', '--limit', '5'), fakeDeps({ createClient: () => ({ getMessages }) }));
    expect(getMessages).toHaveBeenCalledWith('111111111111111111', { limit: 5, before: undefined, after: undefined });
  });

  // --- New tests ---

  it('channels --server 77 calls getGuildChannels with "77" and prints channel list', async () => {
    const getGuildChannels = vi.fn().mockResolvedValue([
      { id: '111111111111111111', name: 'general', type: 0, parent_id: null },
      { id: '222222222222222222', name: 'voice', type: 2, parent_id: null },
    ]);
    await run(
      argv('channels', '--server', '77'),
      fakeDeps({ createClient: () => ({ getGuildChannels }) }),
    );
    expect(getGuildChannels).toHaveBeenCalledWith('77');
    const printed = out.mock.calls.map((c) => c[0]).join('');
    const json = JSON.parse(printed);
    expect(json.serverId).toBe('77');
    expect(json.channels.length).toBe(2);
    expect(process.exitCode).toBe(0);
  });

  it('channels --server 77 --format table prints formatted list', async () => {
    const getGuildChannels = vi.fn().mockResolvedValue([
      { id: '111111111111111111', name: 'general', type: 0, parent_id: null },
    ]);
    await run(
      argv('--format', 'table', 'channels', '--server', '77'),
      fakeDeps({ createClient: () => ({ getGuildChannels }) }),
    );
    expect(getGuildChannels).toHaveBeenCalledWith('77');
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('general');
    expect(printed).toContain('111111111111111111');
    expect(process.exitCode).toBe(0);
  });

  it('threads --channel passes options through and prints JSON', async () => {
    const getActiveThreads = vi.fn().mockResolvedValue({ threads: [
      { id: '501', name: 'Bug thing', parent_id: '111111111111111111', thread_metadata: {}, applied_tags: [] },
      { id: '502', name: 'other', parent_id: '111111111111111111', thread_metadata: {}, applied_tags: [] },
    ] });
    await run(
      argv('threads', '--channel', '111111111111111111', '--query', 'bug', '--limit', '5'),
      fakeDeps({ createClient: () => ({
        getChannel: async () => ({ id: '111111111111111111', guild_id: '77' }),
        getActiveThreads,
      }) }),
    );
    expect(getActiveThreads).toHaveBeenCalledWith('77');
    const json = JSON.parse(out.mock.calls.map((c) => c[0]).join(''));
    expect(json.count).toBe(1);
    expect(json.threads[0].id).toBe('501');
    expect(process.exitCode).toBe(0);
  });

  it('threads --archived --before passes them to getArchivedThreads; --format table prints', async () => {
    const getArchivedThreads = vi.fn().mockResolvedValue({ threads: [
      { id: '503', name: 'Old post', parent_id: '111111111111111111', thread_metadata: { archived: true }, applied_tags: [] },
    ], has_more: true });
    await run(
      argv('--format', 'table', 'threads', '--channel', '111111111111111111', '--archived', '--before', '2026-01-01T00:00:00.000Z'),
      fakeDeps({ createClient: () => ({
        getChannel: async () => ({ id: '111111111111111111', guild_id: '77' }),
        getArchivedThreads,
      }) }),
    );
    expect(getArchivedThreads).toHaveBeenCalledWith('111111111111111111', { before: '2026-01-01T00:00:00.000Z', limit: 25 });
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('Old post');
    expect(printed).toContain('archived');
    expect(process.exitCode).toBe(0);
  });

  it('threads --server uses the server listing', async () => {
    const getActiveThreads = vi.fn().mockResolvedValue({ threads: [] });
    await run(argv('threads', '--server', '77', '--unrestricted'), fakeDeps({ createClient: () => ({ getActiveThreads }) }));
    expect(getActiveThreads).toHaveBeenCalledWith('77');
    expect(process.exitCode).toBe(0);
  });

  it('audit calls readAudit and prints empty entries as JSON', async () => {
    const readAudit = vi.fn().mockReturnValue({ entries: [] });
    await run(argv('audit'), fakeDeps({ readAudit }));
    expect(readAudit).toHaveBeenCalledWith({ limit: 20 });
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"entries": []');
    expect(process.exitCode).toBe(0);
  });

  it('audit --format table with no entries prints the no-actions note', async () => {
    const readAudit = vi.fn().mockReturnValue({ entries: [] });
    await run(argv('--format', 'table', 'audit'), fakeDeps({ readAudit }));
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('no audited actions');
    expect(process.exitCode).toBe(0);
  });

  it('post --dry-run does not call createMessage and exits 0', async () => {
    const createMessage = vi.fn();
    await run(
      argv('post', '--channel', '111111111111111111', '--dry-run', '--message', 'hi'),
      fakeDeps({ createClient: () => ({ createMessage, getGuildChannels: async () => [] }) }),
    );
    expect(createMessage).not.toHaveBeenCalled();
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"dryRun": true');
    expect(process.exitCode).toBe(0);
  });

  it('restricted read to a non-allowlisted channel exits 3', async () => {
    await run(
      argv('read', '--channel', '999999999999999999'),
      fakeDeps(),
    );
    expect(process.exitCode).toBe(3);
    const stderr = err.mock.calls.map((c) => c[0]).join('');
    expect(stderr).toContain('Blocked by allowlist');
  });

  it('open-mode post --unrestricted to channel in allowlisted server succeeds', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '200', content: 'hi' });
    const getChannel = vi.fn().mockResolvedValue({ id: '222222222222222222', guild_id: '77' });
    await run(
      argv('post', '--unrestricted', '--channel', '222222222222222222', '--message', 'hi'),
      fakeDeps({
        createClient: () => ({
          createMessage,
          getChannel,
          getGuildChannels: async () => [],
        }),
      }),
    );
    expect(createMessage).toHaveBeenCalled();
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"messageId": "200"');
    expect(process.exitCode).toBe(0);
  });

  it('doctor JSON output contains "mode": "restricted"', async () => {
    await run(argv('doctor'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"mode": "restricted"');
    expect(process.exitCode).toBe(0);
  });
});
