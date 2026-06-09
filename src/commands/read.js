import { InvalidInputError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

export async function runRead(opts, deps) {
  if (!opts.channel) throw new InvalidInputError('Provide --channel <alias|id>.');

  const { resolveRead } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveRead(opts.channel);
  if (r.denied) {
    throw new InvalidInputError(
      `Unknown channel alias: ${r.denied}. Use a known alias (see \`discord allow list\`) or a raw channel ID.`,
    );
  }

  let limit = opts.limit != null ? parseInt(opts.limit, 10) : 25;
  if (Number.isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const messages = await client.getMessages(r.channelId, { limit, before: opts.before, after: opts.after });

  return {
    channelId: r.channelId,
    count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author ? m.author.global_name || m.author.username : null,
      authorId: m.author ? m.author.id : null,
      content: m.content,
      timestamp: m.timestamp,
      reactions: (m.reactions || []).map((x) => ({ emoji: x.emoji.name, count: x.count })),
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, url: a.url })),
    })),
  };
}
