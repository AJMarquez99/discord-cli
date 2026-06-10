import { gateChannel, gateThreadParent } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runRead(opts, deps) {
  if (!opts.channel && !opts.thread) throw new InvalidInputError('Provide --channel <id> or --thread <threadId>.');
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const { channelId } = opts.thread
    ? await gateThreadParent({ threadId: opts.thread, mode, allowlist, client })
    : await gateChannel({ channelId: opts.channel, mode, allowlist, client });

  let limit = opts.limit != null ? parseInt(opts.limit, 10) : 25;
  if (Number.isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;
  const messages = await client.getMessages(channelId, { limit, before: opts.before, after: opts.after });
  return {
    channelId, count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author ? m.author.global_name || m.author.username : null,
      authorId: m.author ? m.author.id : null,
      content: m.content, timestamp: m.timestamp,
      reactions: (m.reactions || []).map((x) => ({ emoji: x.emoji.name, count: x.count })),
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, url: a.url })),
    })),
  };
}
