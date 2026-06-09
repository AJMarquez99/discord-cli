import { describe, it, expect } from 'vitest';
import { loadAllowlist, resolveAllowlistPath, makeChannelResolver } from '../src/allowlist.js';
import { MalformedConfigError } from '../src/lib/errors.js';

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
  it('returns empty channels when the file is missing (fail-closed)', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: enoent })).toEqual({ channels: [] });
  });
  it('reads the wrapped { channels: [...] } form', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ channels: [{ alias: 'g', channelId: '1' }] }) });
    expect(al.channels).toHaveLength(1);
  });
  it('also accepts a bare top-level array', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify([{ alias: 'g', channelId: '1' }]) });
    expect(al.channels).toHaveLength(1);
  });
  it('throws MalformedConfigError for malformed JSON content', () => {
    expect(() => loadAllowlist({ env: { HOME: '/h' }, readFile: () => '{ not json' }))
      .toThrow(MalformedConfigError);
  });
  it('returns empty channels for empty/whitespace-only file', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: () => '   ' })).toEqual({ channels: [] });
  });
});

describe('makeChannelResolver', () => {
  const allowlist = { channels: [{ alias: 'general', channelId: '111111111111111111' }] };

  it('resolveWrite maps a known alias to its channelId', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('general')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveWrite allows a raw id that is in the allowlist', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('111111111111111111')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveWrite denies a raw id not in the allowlist', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('222222222222222222')).toEqual({ denied: '222222222222222222' });
  });
  it('resolveWrite denies an unknown alias', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('random')).toEqual({ denied: 'random' });
  });
  it('resolveWrite on an empty allowlist denies everything (fail-closed)', () => {
    expect(makeChannelResolver({ allowlist: { channels: [] } }).resolveWrite('111111111111111111')).toEqual({ denied: '111111111111111111' });
  });

  it('resolveRead accepts any raw id (ungated)', () => {
    expect(makeChannelResolver({ allowlist: { channels: [] } }).resolveRead('333333333333333333')).toEqual({ channelId: '333333333333333333' });
  });
  it('resolveRead maps a known alias', () => {
    expect(makeChannelResolver({ allowlist }).resolveRead('general')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveRead denies an unknown alias (cannot resolve to an id)', () => {
    expect(makeChannelResolver({ allowlist }).resolveRead('mystery')).toEqual({ denied: 'mystery' });
  });

  it('isAllowedId reflects allowlist membership (for thread-parent gating)', () => {
    const r = makeChannelResolver({ allowlist });
    expect(r.isAllowedId('111111111111111111')).toBe(true);
    expect(r.isAllowedId('999999999999999999')).toBe(false);
  });
});
