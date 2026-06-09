import { InvalidInputError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

export async function runReact(opts, deps) {
  if (!opts.channel || !opts.message || !opts.emoji) {
    throw new InvalidInputError('Provide --channel <alias|id>, --message <messageId>, and --emoji.');
  }

  const { resolveRead } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveRead(opts.channel);
  if (r.denied) {
    throw new InvalidInputError(`Unknown channel alias: ${r.denied}. Use a known alias or a raw channel ID.`);
  }

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  await client.addReaction(r.channelId, opts.message, opts.emoji);
  return { channelId: r.channelId, messageId: opts.message, emoji: opts.emoji, reacted: true };
}
