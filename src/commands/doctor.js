import { MissingCredentialsError, MalformedConfigError } from '../lib/errors.js';

/**
 * Health check: is a token present, and does Discord accept it? Never throws — returns a
 * diagnostic envelope so callers always get a readable report.
 */
export async function runDoctor(opts, deps) {
  let allowlist = 0;
  try {
    allowlist = deps.loadAllowlist().channels.filter((c) => c && c.channelId).length;
  } catch {
    // A malformed allowlist shouldn't crash the health check; report 0 and let other
    // commands surface the specific config error.
    allowlist = 0;
  }

  let creds;
  try {
    creds = deps.resolveCredentials();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, credentials: 'missing', api: 'skipped', error: err.message, allowlist };
    }
    if (err instanceof MalformedConfigError) {
      return { ok: false, credentials: 'malformed', api: 'skipped', error: err.message, allowlist };
    }
    throw err;
  }

  const client = deps.createClient(creds);
  try {
    const me = await client.getMe();
    return { ok: true, bot: me.username, botId: me.id, source: creds.source, credentials: 'ok', api: 'ok', allowlist };
  } catch (err) {
    return { ok: false, source: creds.source, credentials: 'ok', api: err.message || String(err), allowlist };
  }
}
