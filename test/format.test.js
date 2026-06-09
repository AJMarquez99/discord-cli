import { describe, it, expect } from 'vitest';
import { formatPost, formatRead, formatReact, formatThread, formatAllowList, formatDoctor } from '../src/lib/format.js';

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

  it('formatReact confirms the reaction', () => {
    expect(formatReact({ channelId: '1', messageId: '2', emoji: '👍', reacted: true })).toContain('👍');
  });

  it('formatThread shows the new thread id and name', () => {
    const out = formatThread({ parentChannelId: '1', threadId: '50', name: 'topic' });
    expect(out).toContain('50');
    expect(out).toContain('topic');
  });

  it('formatAllowList renders entries, and a note when empty', () => {
    expect(formatAllowList({ count: 0, channels: [] })).toContain('empty');
    const out = formatAllowList({ count: 1, channels: [{ alias: 'general', channelId: '111', serverId: null }] });
    expect(out).toContain('general');
    expect(out).toContain('111');
  });

  it('formatDoctor reports status and bot identity', () => {
    const out = formatDoctor({ ok: true, bot: 'mybot', botId: '7', source: 'env', credentials: 'ok', api: 'ok', allowlist: 3 });
    expect(out).toContain('ok');
    expect(out).toContain('mybot');
    expect(out).toContain('3');
  });
});
