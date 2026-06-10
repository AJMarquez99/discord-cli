import { gateChannel } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runThreadCreate(opts, deps) {
  if (!opts.channel || !opts.from || !opts.name) {
    throw new InvalidInputError('Provide --channel <id>, --from <messageId>, and --name "...".');
  }
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const { channelId } = await gateChannel({ channelId: opts.channel, mode, allowlist: deps.loadAllowlist(), client });
  const payload = { name: opts.name };
  if (opts.autoArchive) payload.auto_archive_duration = parseInt(opts.autoArchive, 10);
  const thread = await client.startThreadFromMessage(channelId, opts.from, payload);
  return { parentChannelId: channelId, threadId: thread.id, name: thread.name };
}
