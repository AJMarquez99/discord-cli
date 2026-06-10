import { describe, it, expect, vi } from 'vitest';
import { resolveAuditPath, appendAudit, readAudit } from '../src/lib/audit.js';

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
