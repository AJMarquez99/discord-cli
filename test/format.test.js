import { describe, it, expect } from 'vitest';
import { formatPost, formatRead, formatReact, formatThread, formatAllowList, formatDoctor, formatChannels, formatAudit } from '../src/lib/format.js';

describe('table formatters', () => {
  it('formatPost shows channel and message id', () => {
    const out = formatPost({ channelId: '123', messageId: '99', content: 'hi' });
    expect(out).toContain('123');
    expect(out).toContain('99');
  });

  it('formatRead lists one line per message', () => {
    const out = formatRead({ channelId: '1', count: 2, messages: [
      { id: 'a', author: 'alice', content: 'hello', timestamp: 't1' },
      { id: 'b', author: 'bob', content: 'world', timestamp: 't2' },
    ]});
    expect(out.split('\n').filter((l) => l.includes('alice') || l.includes('bob'))).toHaveLength(2);
  });

  it('formatRead handles an empty channel', () => {
    expect(formatRead({ channelId: '1', count: 0, messages: [] })).toContain('no messages');
  });

  it('formatRead handles a missing messages key without throwing', () => {
    expect(formatRead({ channelId: '1', count: 0 })).toContain('no messages');
  });

  it('formatReact confirms the reaction', () => {
    expect(formatReact({ channelId: '1', messageId: '2', emoji: '👍', reacted: true })).toContain('👍');
  });

  it('formatThread shows the new thread id and name', () => {
    const out = formatThread({ parentChannelId: '1', threadId: '50', name: 'topic' });
    expect(out).toContain('50');
    expect(out).toContain('topic');
  });

  it('formatAllowList shows a note when empty', () => {
    expect(formatAllowList({ channelCount: 0, channels: [], serverCount: 0, servers: [] })).toContain('empty');
  });

  it('formatAllowList renders channel and server ids', () => {
    const out = formatAllowList({ channelCount: 1, channels: ['111'], serverCount: 1, servers: ['999'] });
    expect(out).toContain('111');
    expect(out).toContain('999');
    expect(out).toContain('channels (1)');
    expect(out).toContain('servers (1)');
  });

  it('formatDoctor reports status, bot identity, mode and server count', () => {
    const out = formatDoctor({ ok: true, bot: 'mybot', botId: '7', source: 'env', credentials: 'ok', api: 'ok', mode: 'restricted', allowlist: 3, servers: 1 });
    expect(out).toContain('ok');
    expect(out).toContain('mybot');
    expect(out).toContain('3');
    expect(out).toContain('mode:');
    expect(out).toContain('restricted');
  });

  it('formatDoctor describes open mode', () => {
    const out = formatDoctor({ ok: true, bot: 'mybot', botId: '7', source: 'env', credentials: 'ok', api: 'ok', mode: 'open', allowlist: 0, servers: 2 });
    expect(out).toContain('OPEN');
    expect(out).toContain('2 allowed server');
  });

  it('formatChannels marks allowlisted channels with * and shows name/id/type', () => {
    const out = formatChannels({
      serverId: '77',
      count: 2,
      channels: [
        { id: '10', name: 'general', type: 'text', parentId: '99', allowlisted: true },
        { id: '12', name: 'announce', type: 'announcement', parentId: null, allowlisted: false },
      ],
    });
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/^\*/);
    expect(lines[0]).toContain('general');
    expect(lines[0]).toContain('10');
    expect(lines[0]).toContain('text');
    expect(lines[1]).toMatch(/^ /);
    expect(lines[1]).toContain('announce');
    expect(lines[1]).toContain('announcement');
  });

  it('formatChannels returns a "no channels" note when empty', () => {
    expect(formatChannels({ serverId: '77', count: 0, channels: [] })).toContain('no channels');
  });

  describe('formatAudit', () => {
    it('returns a "no audited actions yet" note when entries is empty', () => {
      expect(formatAudit({ entries: [] })).toBe('(no audited actions yet)');
    });

    it('renders one line per entry containing ts, action, channelId, and mode', () => {
      const entries = [
        { ts: '2024-01-01T00:00:00Z', action: 'post', channelId: '123', messageId: '9', mode: 'restricted' },
        { ts: '2024-01-02T00:00:00Z', action: 'react', channelId: '456', messageId: '7', emoji: '👍', mode: 'open' },
      ];
      const out = formatAudit({ entries });
      const lines = out.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('2024-01-01T00:00:00Z');
      expect(lines[0]).toContain('post');
      expect(lines[0]).toContain('ch 123');
      expect(lines[0]).toContain('[restricted]');
      expect(lines[1]).toContain('2024-01-02T00:00:00Z');
      expect(lines[1]).toContain('react');
      expect(lines[1]).toContain('ch 456');
      expect(lines[1]).toContain('👍');
      expect(lines[1]).toContain('[open]');
    });

    it('includes messageId and threadId when present', () => {
      const entries = [
        { ts: 't', action: 'thread', channelId: '1', threadId: '55', mode: 'restricted' },
      ];
      const out = formatAudit({ entries });
      expect(out).toContain('thread 55');
    });
  });
});
