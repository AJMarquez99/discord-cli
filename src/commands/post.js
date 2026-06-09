import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

/**
 * Send a message. Target is a thread (--thread) if given, else a channel (--channel).
 * Allowlist-gated: a channel target must resolve via the allowlist; a thread target is
 * gated by its parent channel (fetched via getChannel(threadId)). Optional --reply-to
 * adds a message_reference to thread a reply.
 */
export async function runPost(opts, deps) {
  const content = opts.message;
  if (!opts.channel && !opts.thread) {
    throw new InvalidInputError('Provide --channel <alias|id> (or --thread <threadId>).');
  }
  if (!content || !String(content).trim()) {
    throw new InvalidInputError('Empty message. Provide --message or pipe the body on stdin.');
  }

  const { resolveWrite, isAllowedId } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);

  let targetChannelId;
  if (opts.thread) {
    const thread = await client.getChannel(opts.thread);
    const parentId = thread && thread.parent_id;
    if (!parentId || !isAllowedId(parentId)) {
      throw new ChannelNotAllowedError(opts.thread, `parent channel ${parentId || '(unknown)'} not allowlisted`);
    }
    targetChannelId = opts.thread;
  } else {
    const r = resolveWrite(opts.channel);
    if (r.denied) throw new ChannelNotAllowedError(r.denied);
    targetChannelId = r.channelId;
  }

  const payload = { content: String(content) };
  if (opts.replyTo) payload.message_reference = { message_id: opts.replyTo };

  const msg = await client.createMessage(targetChannelId, payload);
  return { channelId: targetChannelId, messageId: msg.id, content: msg.content, replyTo: opts.replyTo || null };
}
