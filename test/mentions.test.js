import { describe, it, expect } from 'vitest';
import { buildAllowedMentions } from '../src/lib/mentions.js';

describe('buildAllowedMentions', () => {
  it('default → { parse: ["users"] }', () => {
    expect(buildAllowedMentions()).toEqual({ parse: ['users'] });
  });

  it('allowEveryone adds "everyone" to parse', () => {
    const r = buildAllowedMentions({ allowEveryone: true });
    expect(r.parse).toContain('everyone');
    expect(r.parse).toContain('users');
  });

  it('allowRoles adds "roles" to parse', () => {
    const r = buildAllowedMentions({ allowRoles: true });
    expect(r.parse).toContain('roles');
    expect(r.parse).toContain('users');
  });

  it('isReply adds replied_user: true', () => {
    const r = buildAllowedMentions({ isReply: true });
    expect(r.replied_user).toBe(true);
  });

  it('default does not include replied_user', () => {
    const r = buildAllowedMentions();
    expect(r.replied_user).toBeUndefined();
  });

  it('all options combined', () => {
    const r = buildAllowedMentions({ allowEveryone: true, allowRoles: true, isReply: true });
    expect(r.parse).toEqual(expect.arrayContaining(['users', 'everyone', 'roles']));
    expect(r.replied_user).toBe(true);
  });
});
