import { gateChannel } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { recordAction } from '../lib/audit.js';
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';

export async function runThreadCreate(opts, deps) {
  if (!opts.channel || !opts.from || !opts.name) {
    throw new InvalidInputError('Provide --channel <id>, --from <messageId>, and --name "...".');
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
      return { dryRun: true, action: 'thread', parentChannelId: null, from: opts.from, name: opts.name, blocked: true, reason: err.message, mode };
    }
    throw err;
  }

  if (opts.dryRun) {
    return { dryRun: true, action: 'thread', parentChannelId: channelId, from: opts.from, name: opts.name, blocked: false, reason: null, mode, allowlisted };
  }

  const payload = { name: opts.name };
  if (opts.autoArchive) payload.auto_archive_duration = parseInt(opts.autoArchive, 10);
  const thread = await client.startThreadFromMessage(channelId, opts.from, payload);
  recordAction({
    append: deps.appendAudit, now: deps.now, config, opts,
    entry: { action: 'thread', channelId, threadId: thread.id, mode, allowlisted },
  });
  return { parentChannelId: channelId, threadId: thread.id, name: thread.name };
}
