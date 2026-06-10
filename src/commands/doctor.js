import { MissingCredentialsError, MalformedConfigError } from '../lib/errors.js';
import { resolveMode } from '../config.js';

/**
 * Health check. Never throws — returns a diagnostic envelope. Reports the active mode and
 * allowlist/server counts. A malformed allowlist/config is tolerated (reported, not crashed).
 */
export async function runDoctor(opts, deps) {
  let allowlist = { channels: [], servers: [] };
  try { allowlist = deps.loadAllowlist(); } catch { /* malformed allowlist — report 0s */ }
  const channelCount = allowlist.channels.filter(Boolean).length;
  const serverCount = allowlist.servers.length;
  let mode = 'restricted';
  try { mode = resolveMode({ config: deps.loadConfig(), env: process.env }); } catch { /* keep default */ }

  let creds;
  try {
    creds = deps.resolveCredentials();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, credentials: 'missing', api: 'skipped', error: err.message, mode, allowlist: channelCount, servers: serverCount };
    }
    if (err instanceof MalformedConfigError) {
      return { ok: false, credentials: 'malformed', api: 'skipped', error: err.message, mode, allowlist: channelCount, servers: serverCount };
    }
    throw err;
  }

  const client = deps.createClient(creds);
  try {
    const me = await client.getMe();
    return { ok: true, bot: me.username, botId: me.id, source: creds.source, credentials: 'ok', api: 'ok', mode, allowlist: channelCount, servers: serverCount };
  } catch (err) {
    return { ok: false, source: creds.source, credentials: 'ok', api: err.message || String(err), mode, allowlist: channelCount, servers: serverCount };
  }
}
