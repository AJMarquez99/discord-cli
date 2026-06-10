import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function resolveAuditPath(env = process.env) {
  if (env.DISCORD_AUDIT_LOG) return env.DISCORD_AUDIT_LOG;
  return join(env.HOME || '', '.config', 'discord-cli', 'audit.jsonl');
}

export function appendAudit(entry, { env = process.env, appendFile = appendFileSync } = {}) {
  appendFile(resolveAuditPath(env), JSON.stringify(entry) + '\n');
}

export function readAudit({ limit = 20, env = process.env, readFile = readFileSync } = {}) {
  const path = resolveAuditPath(env);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { entries: [] };
    throw err;
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line)); } catch { /* skip malformed line */ }
  }
  parsed.reverse();
  return { entries: parsed.slice(0, limit) };
}

/**
 * Record an action to the audit log, honoring config + per-call flags. Never throws — a write
 * failure warns to stderr. `append`/`now` are injected (deps.appendAudit / deps.now).
 *   opts: { noAudit?, audit?, logBody? }   (commander maps --no-audit → opts.audit === false)
 *   config: { auditLog: { enabled, logBody } }
 *   entry: the audit fields; `body` is dropped unless logBody is enabled.
 */
export function recordAction({ append, now, config, opts = {}, entry }) {
  const enabled = config.auditLog.enabled !== false;
  if (opts.noAudit || opts.audit === false || !enabled) return;
  const e = { ts: now(), ...entry };
  if (!(config.auditLog.logBody || opts.logBody)) delete e.body;
  try {
    append(e);
  } catch (err) {
    process.stderr.write(`warn: audit write failed: ${err.message}\n`);
  }
}
