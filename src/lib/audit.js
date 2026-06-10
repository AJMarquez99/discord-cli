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
