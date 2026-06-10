import { describe, it, expect } from 'vitest';
import { TOOLS } from '../src/mcp/tools.js';
import { runPost } from '../src/commands/post.js';
import { runRead } from '../src/commands/read.js';
import { runReact } from '../src/commands/react.js';
import { runThreadCreate } from '../src/commands/thread.js';
import { runChannels } from '../src/commands/channels.js';
import { runAudit } from '../src/commands/audit.js';
import { runDoctor } from '../src/commands/doctor.js';
import { runAllowList } from '../src/commands/allow.js';

const EXPECTED_NAMES = [
  'discord_post',
  'discord_read',
  'discord_react',
  'discord_create_thread',
  'discord_channels',
  'discord_audit',
  'discord_doctor',
  'discord_allowlist',
];

describe('TOOLS table', () => {
  it('has the 8 expected tool names in order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(EXPECTED_NAMES);
  });

  it('discord_post command is runPost', () => {
    const t = TOOLS.find((t) => t.name === 'discord_post');
    expect(t.command).toBe(runPost);
  });

  it('discord_read command is runRead', () => {
    const t = TOOLS.find((t) => t.name === 'discord_read');
    expect(t.command).toBe(runRead);
  });

  it('discord_react command is runReact', () => {
    const t = TOOLS.find((t) => t.name === 'discord_react');
    expect(t.command).toBe(runReact);
  });

  it('discord_create_thread command is runThreadCreate', () => {
    const t = TOOLS.find((t) => t.name === 'discord_create_thread');
    expect(t.command).toBe(runThreadCreate);
  });

  it('discord_channels command is runChannels', () => {
    const t = TOOLS.find((t) => t.name === 'discord_channels');
    expect(t.command).toBe(runChannels);
  });

  it('discord_audit command is runAudit', () => {
    const t = TOOLS.find((t) => t.name === 'discord_audit');
    expect(t.command).toBe(runAudit);
  });

  it('discord_doctor command is runDoctor', () => {
    const t = TOOLS.find((t) => t.name === 'discord_doctor');
    expect(t.command).toBe(runDoctor);
  });

  it('discord_allowlist command is runAllowList', () => {
    const t = TOOLS.find((t) => t.name === 'discord_allowlist');
    expect(t.command).toBe(runAllowList);
  });

  describe('mapArgs — snake_case → camelCase', () => {
    it('discord_post maps all renamed fields', () => {
      const t = TOOLS.find((t) => t.name === 'discord_post');
      const result = t.mapArgs({
        channel: 'ch', thread: 'th', message: 'msg',
        reply_to: 'r1', unrestricted: true, dry_run: false,
        no_audit: true, log_body: false,
        allow_everyone: true, allow_roles: false,
      });
      expect(result).toEqual({
        channel: 'ch', thread: 'th', message: 'msg',
        replyTo: 'r1', unrestricted: true, dryRun: false,
        noAudit: true, logBody: false,
        allowEveryone: true, allowRoles: false,
      });
    });

    it('discord_read preserves thread, maps no renames', () => {
      const t = TOOLS.find((t) => t.name === 'discord_read');
      const result = t.mapArgs({ channel: 'c', thread: 'th', limit: 10, before: 'b', after: 'a', unrestricted: false });
      expect(result).toEqual({ channel: 'c', thread: 'th', limit: 10, before: 'b', after: 'a', unrestricted: false });
    });

    it('discord_react maps dry_run and no_audit', () => {
      const t = TOOLS.find((t) => t.name === 'discord_react');
      const result = t.mapArgs({ channel: 'c', thread: 'th', message: 'm', emoji: 'e', unrestricted: true, dry_run: true, no_audit: false });
      expect(result).toEqual({ channel: 'c', thread: 'th', message: 'm', emoji: 'e', unrestricted: true, dryRun: true, noAudit: false });
    });

    it('discord_create_thread maps auto_archive and no_audit', () => {
      const t = TOOLS.find((t) => t.name === 'discord_create_thread');
      const result = t.mapArgs({ channel: 'c', from: 'f', name: 'n', auto_archive: 1440, unrestricted: false, dry_run: true, no_audit: true });
      expect(result).toEqual({ channel: 'c', from: 'f', name: 'n', autoArchive: 1440, unrestricted: false, dryRun: true, noAudit: true });
    });

    it('discord_channels passes server and type through', () => {
      const t = TOOLS.find((t) => t.name === 'discord_channels');
      expect(t.mapArgs({ server: 's', type: 'text' })).toEqual({ server: 's', type: 'text' });
    });

    it('discord_audit passes limit through', () => {
      const t = TOOLS.find((t) => t.name === 'discord_audit');
      expect(t.mapArgs({ limit: 5 })).toEqual({ limit: 5 });
    });

    it('discord_doctor returns empty object', () => {
      const t = TOOLS.find((t) => t.name === 'discord_doctor');
      expect(t.mapArgs()).toEqual({});
    });

    it('discord_allowlist returns empty object', () => {
      const t = TOOLS.find((t) => t.name === 'discord_allowlist');
      expect(t.mapArgs()).toEqual({});
    });
  });
});
