import { gateChannel } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { recordAction } from '../lib/audit.js';
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';

export async function runReact(opts, deps) {
  if (!opts.channel || !opts.message || !opts.emoji) {
    throw new InvalidInputError('Provide --channel <id>, --message <messageId>, and --emoji.');
  }
  const config = deps.loadConfig();
  const mode = resolveMode({ config, env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);

  let channelId;
  let allowlisted;
  try {
    const gated = await gateChannel({ channelId: opts.channel, mode, allowlist, client });
    channelId = gated.channelId; allowlisted = gated.allowlisted;
  } catch (err) {
    if (opts.dryRun && err instanceof ChannelNotAllowedError) {
      return { dryRun: true, action: 'react', targetChannelId: null, messageId: opts.message, emoji: opts.emoji, blocked: true, reason: err.message, mode };
    }
    throw err;
  }

  if (opts.dryRun) {
    return { dryRun: true, action: 'react', targetChannelId: channelId, messageId: opts.message, emoji: opts.emoji, blocked: false, reason: null, mode, allowlisted };
  }

  await client.addReaction(channelId, opts.message, opts.emoji);
  recordAction({
    append: deps.appendAudit, now: deps.now, config, opts,
    entry: { action: 'react', channelId, messageId: opts.message, emoji: opts.emoji, mode, allowlisted },
  });
  return { channelId, messageId: opts.message, emoji: opts.emoji, reacted: true };
}
