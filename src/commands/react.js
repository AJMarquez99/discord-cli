import { gateChannel } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runReact(opts, deps) {
  if (!opts.channel || !opts.message || !opts.emoji) {
    throw new InvalidInputError('Provide --channel <id>, --message <messageId>, and --emoji.');
  }
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const { channelId } = await gateChannel({ channelId: opts.channel, mode, allowlist: deps.loadAllowlist(), client });
  await client.addReaction(channelId, opts.message, opts.emoji);
  return { channelId, messageId: opts.message, emoji: opts.emoji, reacted: true };
}
