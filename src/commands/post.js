import { gateChannel, gateThreadParent } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runPost(opts, deps) {
  const content = opts.message;
  if (!opts.channel && !opts.thread) {
    throw new InvalidInputError('Provide --channel <id> (or --thread <threadId>).');
  }
  if (!content || !String(content).trim()) {
    throw new InvalidInputError('Empty message. Provide --message or pipe the body on stdin.');
  }
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);

  let target;
  if (opts.thread) {
    const gated = await gateThreadParent({ threadId: opts.thread, mode, allowlist, client });
    target = gated.channelId;
  } else {
    const gated = await gateChannel({ channelId: opts.channel, mode, allowlist, client });
    target = gated.channelId;
  }

  const payload = { content: String(content) };
  if (opts.replyTo) payload.message_reference = { message_id: opts.replyTo };
  const msg = await client.createMessage(target, payload);
  return { channelId: target, messageId: msg.id, content: msg.content, replyTo: opts.replyTo || null };
}
