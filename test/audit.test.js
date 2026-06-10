import { describe, it, expect, vi } from 'vitest';
import { resolveAuditPath, appendAudit, readAudit, recordAction } from '../src/lib/audit.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveAuditPath', () => {
  it('honors DISCORD_AUDIT_LOG', () => {
    expect(resolveAuditPath({ DISCORD_AUDIT_LOG: '/x/a.jsonl' })).toBe('/x/a.jsonl');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveAuditPath({ HOME: '/h' })).toBe('/h/.config/discord-cli/audit.jsonl');
  });
});

describe('appendAudit', () => {
  it('appends a single JSON line to the resolved path', () => {
    const appendFile = vi.fn();
    appendAudit({ action: 'post', channelId: '1' }, { env: { HOME: '/h' }, appendFile });
    expect(appendFile).toHaveBeenCalledWith('/h/.config/discord-cli/audit.jsonl', '{"action":"post","channelId":"1"}\n');
  });
});

describe('readAudit', () => {
  it('returns empty entries when the file is missing', () => {
    expect(readAudit({ env: { HOME: '/h' }, readFile: enoent })).toEqual({ entries: [] });
  });
  it('returns newest-first and respects limit, skipping malformed lines', () => {
    const raw = '{"action":"a"}\n{"action":"b"}\nnot json\n{"action":"c"}\n';
    const r = readAudit({ limit: 2, env: { HOME: '/h' }, readFile: () => raw });
    expect(r.entries).toEqual([{ action: 'c' }, { action: 'b' }]);
  });
  it('defaults limit to 20', () => {
    const raw = Array.from({ length: 30 }, (_, i) => JSON.stringify({ n: i })).join('\n');
    const r = readAudit({ env: { HOME: '/h' }, readFile: () => raw });
    expect(r.entries).toHaveLength(20);
    expect(r.entries[0]).toEqual({ n: 29 });
  });
});

describe('recordAction', () => {
  const baseConfig = { auditLog: { enabled: true, logBody: false } };
  const now = () => '2026-06-09T00:00:00.000Z';

  it('writes entry with ts when enabled', () => {
    const append = vi.fn();
    recordAction({ append, now, config: baseConfig, opts: {}, entry: { action: 'post', channelId: '1' } });
    expect(append).toHaveBeenCalledOnce();
    expect(append.mock.calls[0][0]).toMatchObject({ ts: '2026-06-09T00:00:00.000Z', action: 'post', channelId: '1' });
  });

  it('skips when opts.audit === false', () => {
    const append = vi.fn();
    recordAction({ append, now, config: baseConfig, opts: { audit: false }, entry: { action: 'post' } });
    expect(append).not.toHaveBeenCalled();
  });

  it('skips when opts.noAudit is true', () => {
    const append = vi.fn();
    recordAction({ append, now, config: baseConfig, opts: { noAudit: true }, entry: { action: 'post' } });
    expect(append).not.toHaveBeenCalled();
  });

  it('skips when config.auditLog.enabled === false', () => {
    const append = vi.fn();
    recordAction({ append, now, config: { auditLog: { enabled: false } }, opts: {}, entry: { action: 'post' } });
    expect(append).not.toHaveBeenCalled();
  });

  it('drops body when config.auditLog.logBody is false and opts.logBody is not set', () => {
    const append = vi.fn();
    recordAction({ append, now, config: baseConfig, opts: {}, entry: { action: 'post', body: 'hello' } });
    expect(append.mock.calls[0][0]).not.toHaveProperty('body');
  });

  it('includes body when config.auditLog.logBody is true', () => {
    const append = vi.fn();
    const config = { auditLog: { enabled: true, logBody: true } };
    recordAction({ append, now, config, opts: {}, entry: { action: 'post', body: 'hello' } });
    expect(append.mock.calls[0][0]).toHaveProperty('body', 'hello');
  });

  it('includes body when opts.logBody is true', () => {
    const append = vi.fn();
    recordAction({ append, now, config: baseConfig, opts: { logBody: true }, entry: { action: 'post', body: 'hello' } });
    expect(append.mock.calls[0][0]).toHaveProperty('body', 'hello');
  });

  it('does not propagate a throwing append (warns to stderr instead)', () => {
    const append = () => { throw new Error('disk full'); };
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => {});
    expect(() =>
      recordAction({ append, now, config: baseConfig, opts: {}, entry: { action: 'post' } })
    ).not.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('audit write failed'));
    stderrSpy.mockRestore();
  });
});
