import { gateChannel, gateThreadParent } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { buildAllowedMentions } from '../lib/mentions.js';
import { recordAction } from '../lib/audit.js';
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';

export async function runPost(opts, deps) {
  const content = opts.message;
  if (!opts.channel && !opts.thread) {
    throw new InvalidInputError('Provide --channel <id> (or --thread <threadId>).');
  }
  if (!content || !String(content).trim()) {
    throw new InvalidInputError('Empty message. Provide --message or pipe the body on stdin.');
  }
  const config = deps.loadConfig();
  const mode = resolveMode({ config, env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const allowedMentions = buildAllowedMentions({
    allowEveryone: opts.allowEveryone, allowRoles: opts.allowRoles, isReply: !!opts.replyTo,
  });

  // Resolve + gate the target. In dry-run, a block is reported (not thrown).
  let target;
  let allowlisted;
  try {
    if (opts.thread) {
      const gated = await gateThreadParent({ threadId: opts.thread, mode, allowlist, client });
      target = gated.channelId; allowlisted = gated.allowlisted;
    } else {
      const gated = await gateChannel({ channelId: opts.channel, mode, allowlist, client });
      target = gated.channelId; allowlisted = gated.allowlisted;
    }
  } catch (err) {
    if (opts.dryRun && err instanceof ChannelNotAllowedError) {
      return {
        dryRun: true, action: 'post', targetChannelId: null, blocked: true, reason: err.message,
        mode, content: String(content), allowedMentions, replyTo: opts.replyTo || null,
      };
    }
    throw err;
  }

  if (opts.dryRun) {
    return {
      dryRun: true, action: 'post', targetChannelId: target, blocked: false, reason: null,
      mode, allowlisted, content: String(content), allowedMentions, replyTo: opts.replyTo || null,
    };
  }

  const payload = { content: String(content), allowed_mentions: allowedMentions };
  if (opts.replyTo) payload.message_reference = { message_id: opts.replyTo };
  const msg = await client.createMessage(target, payload);

  recordAction({
    append: deps.appendAudit, now: deps.now, config, opts,
    entry: { action: 'post', channelId: target, messageId: msg.id, mode, allowlisted, body: String(content) },
  });

  return { channelId: target, messageId: msg.id, content: msg.content, replyTo: opts.replyTo || null };
}
