import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

/**
 * Start a thread from an existing message. Gated by the parent --channel (allowlisted).
 * `discord thread create --channel <alias|id> --from <messageId> --name "..."`.
 */
export async function runThreadCreate(opts, deps) {
  if (!opts.channel || !opts.from || !opts.name) {
    throw new InvalidInputError('Provide --channel <alias|id>, --from <messageId>, and --name "...".');
  }

  const { resolveWrite } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveWrite(opts.channel);
  if (r.denied) throw new ChannelNotAllowedError(r.denied);

  const payload = { name: opts.name };
  if (opts.autoArchive) payload.auto_archive_duration = parseInt(opts.autoArchive, 10);

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const thread = await client.startThreadFromMessage(r.channelId, opts.from, payload);
  return { parentChannelId: r.channelId, threadId: thread.id, name: thread.name };
}
