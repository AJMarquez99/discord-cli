import { z } from 'zod';
import { runPost } from '../commands/post.js';
import { runRead } from '../commands/read.js';
import { runReact } from '../commands/react.js';
import { runThreadCreate } from '../commands/thread.js';
import { runChannels } from '../commands/channels.js';
import { runAudit } from '../commands/audit.js';
import { runDoctor } from '../commands/doctor.js';
import { runAllowList } from '../commands/allow.js';

// Each tool: { name, description, inputSchema (zod raw shape), command (run* fn), mapArgs (args→opts) }.
export const TOOLS = [
  {
    name: 'discord_post',
    description: 'Post a message to an allowlisted channel (or thread). @everyone/@here/role pings are stripped unless allow_everyone/allow_roles.',
    inputSchema: {
      channel: z.string().optional(), thread: z.string().optional(), message: z.string(),
      reply_to: z.string().optional(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(),
      no_audit: z.boolean().optional(), log_body: z.boolean().optional(),
      allow_everyone: z.boolean().optional(), allow_roles: z.boolean().optional(),
    },
    command: runPost,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, message: a.message, replyTo: a.reply_to, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit, logBody: a.log_body, allowEveryone: a.allow_everyone, allowRoles: a.allow_roles }),
  },
  {
    name: 'discord_read',
    description: 'Read recent messages from an allowlisted channel or thread.',
    inputSchema: { channel: z.string().optional(), thread: z.string().optional(), limit: z.number().optional(), before: z.string().optional(), after: z.string().optional(), unrestricted: z.boolean().optional() },
    command: runRead,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, limit: a.limit, before: a.before, after: a.after, unrestricted: a.unrestricted }),
  },
  {
    name: 'discord_react',
    description: 'Add a reaction to a message in an allowlisted channel or thread.',
    inputSchema: { channel: z.string().optional(), thread: z.string().optional(), message: z.string(), emoji: z.string(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(), no_audit: z.boolean().optional() },
    command: runReact,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, message: a.message, emoji: a.emoji, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit }),
  },
  {
    name: 'discord_create_thread',
    description: 'Create a thread from a message in an allowlisted channel.',
    inputSchema: { channel: z.string(), from: z.string(), name: z.string(), auto_archive: z.number().optional(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(), no_audit: z.boolean().optional() },
    command: runThreadCreate,
    mapArgs: (a) => ({ channel: a.channel, from: a.from, name: a.name, autoArchive: a.auto_archive, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit }),
  },
  {
    name: 'discord_channels',
    description: "List a server's channels (names → ids, type; marks allowlisted). Metadata only.",
    inputSchema: { server: z.string().optional(), type: z.string().optional() },
    command: runChannels,
    mapArgs: (a) => ({ server: a.server, type: a.type }),
  },
  {
    name: 'discord_audit',
    description: 'Show recent audited actions (newest first).',
    inputSchema: { limit: z.number().optional() },
    command: runAudit,
    mapArgs: (a) => ({ limit: a.limit }),
  },
  {
    name: 'discord_doctor',
    description: 'Verify the bot token; report mode, identity, allowlist + server counts.',
    inputSchema: {},
    command: runDoctor,
    mapArgs: () => ({}),
  },
  {
    name: 'discord_allowlist',
    description: 'Show the allowlisted channel ids and server ids.',
    inputSchema: {},
    command: runAllowList,
    mapArgs: () => ({}),
  },
];
