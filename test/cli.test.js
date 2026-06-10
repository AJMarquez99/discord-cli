import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../src/cli.js';

function fakeDeps(over = {}) {
  return {
    loadAllowlist: () => ({ channels: ['111111111111111111'], servers: [] }),
    loadConfig: () => ({ mode: 'restricted', auditLog: { enabled: true, logBody: false } }),
    resolveCredentials: () => ({ botToken: 'tok', source: 'env' }),
    createClient: () => ({
      getMe: async () => ({ id: '7', username: 'mybot' }),
      createMessage: async () => ({ id: '99', content: 'hi' }),
      getMessages: async () => [],
      addReaction: async () => null,
      getChannel: async () => ({ id: 't', parent_id: '111111111111111111' }),
      startThreadFromMessage: async () => ({ id: '50', name: 'topic' }),
    }),
    now: () => '2026-06-09T00:00:00.000Z',
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
});
