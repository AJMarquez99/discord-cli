import { gateChannel, isAllowedChannel, isAllowedServer } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';
import { snowflakeToIso } from '../lib/snowflake.js';

function clampLimit(raw) {
  let limit = raw != null ? parseInt(raw, 10) : 25;
  if (Number.isNaN(limit) || limit < 1) limit = 25;
  return Math.min(limit, 100);
}

function toRow(t, tagNames, allowlist) {
  const meta = t.thread_metadata || {};
  return {
    id: t.id,
    name: t.name,
    parentId: t.parent_id,
    archived: !!meta.archived,
    locked: !!meta.locked,
    messageCount: t.message_count ?? null,
    createdAt: meta.create_timestamp || snowflakeToIso(t.id),
    lastMessageAt: snowflakeToIso(t.last_message_id),
    tags: (t.applied_tags || []).map((id) => tagNames.get(String(id)) ?? String(id)),
    allowlisted: isAllowedChannel(allowlist, t.parent_id),
  };
}

const tagMap = (channel) =>
  new Map(((channel && channel.available_tags) || []).map((tag) => [String(tag.id), tag.name]));

/**
 * List active (or, per channel, archived) threads / forum posts. Metadata only — never fetches
 * message content. Gated on the PARENT channel's allowlist status.
 */
export async function runThreads(opts, deps) {
  if (opts.channel && opts.server) throw new InvalidInputError('Provide either --channel or --server, not both.');
  if (opts.archived && !opts.channel) throw new InvalidInputError('--archived requires --channel <id> (Discord lists archived threads per channel).');
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  let serverId = opts.server;
  if (!opts.channel && !serverId) {
    if (allowlist.servers.length === 1) serverId = allowlist.servers[0];
    else {
      throw new InvalidInputError(
        `Specify --channel <id> or --server <guildId>. Known servers: ${allowlist.servers.join(', ') || '(none)'}`,
      );
    }
  }
  const limit = clampLimit(opts.limit);
  const client = deps.createClient(deps.resolveCredentials());
  const archived = !!opts.archived;

  let threads;
  let hasMore = false;
  let filtered = 0;
  let channelId = null;
  let guildId;
  const tagsByParent = new Map();

  if (opts.channel) {
    const gate = await gateChannel({ channelId: opts.channel, mode, allowlist, client });
    channelId = gate.channelId;
    const parent = await client.getChannel(channelId);
    guildId = String(parent.guild_id);
    tagsByParent.set(channelId, tagMap(parent));
    if (archived) {
      const res = await client.getArchivedThreads(channelId, { before: opts.before, limit });
      threads = res.threads || [];
      hasMore = !!res.has_more;
    } else {
      const res = await client.getActiveThreads(parent.guild_id);
      threads = (res.threads || []).filter((t) => String(t.parent_id) === channelId);
    }
  } else {
    guildId = String(serverId);
    const res = await client.getActiveThreads(serverId);
    const all = res.threads || [];
    const serverOpen = mode === 'open' && isAllowedServer(allowlist, serverId);
    threads = all.filter((t) => serverOpen || isAllowedChannel(allowlist, t.parent_id));
    filtered = all.length - threads.length;
    const parents = [...new Set(threads.filter((t) => (t.applied_tags || []).length).map((t) => String(t.parent_id)))];
    for (const pid of parents) tagsByParent.set(pid, tagMap(await client.getChannel(pid)));
  }

  if (opts.query) {
    const q = String(opts.query).toLowerCase();
    threads = threads.filter((t) => String(t.name || '').toLowerCase().includes(q));
  }
  const rows = threads.slice(0, limit).map((t) => toRow(t, tagsByParent.get(String(t.parent_id)) || new Map(), allowlist));
  return { channelId, serverId: guildId, archived, count: rows.length, filtered, hasMore, threads: rows };
}
