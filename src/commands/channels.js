import { isAllowedChannel } from '../allowlist.js';
import { InvalidInputError } from '../lib/errors.js';

const TYPE_NAMES = { 0: 'text', 2: 'voice', 4: 'category', 5: 'announcement', 13: 'stage', 15: 'forum' };
const typeName = (t) => TYPE_NAMES[t] || `type:${t}`;

/**
 * List a guild's channels (name → id, type, category, allowlisted). Metadata only — never
 * fetches message content. Ungated discovery; visibility follows the bot's Discord permissions.
 */
export async function runChannels(opts, deps) {
  const allowlist = deps.loadAllowlist();
  let serverId = opts.server;
  if (!serverId) {
    if (allowlist.servers.length === 1) serverId = allowlist.servers[0];
    else {
      throw new InvalidInputError(
        `Specify --server <guildId>. Known servers: ${allowlist.servers.join(', ') || '(none)'}`,
      );
    }
  }
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const list = await client.getGuildChannels(serverId);
  let channels = list.map((c) => ({
    id: c.id,
    name: c.name,
    type: typeName(c.type),
    parentId: c.parent_id || null,
    allowlisted: isAllowedChannel(allowlist, c.id),
  }));
  if (opts.type) channels = channels.filter((c) => c.type === opts.type);
  return { serverId: String(serverId), count: channels.length, channels };
}
