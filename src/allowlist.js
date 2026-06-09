import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MalformedConfigError } from './lib/errors.js';

export function resolveAllowlistPath(env = process.env, _profile) {
  if (env.DISCORD_ALLOWLIST) return env.DISCORD_ALLOWLIST;
  return join(env.HOME || '', '.config', 'discord-cli', 'allowlist.json');
}

/**
 * Load the channel allowlist. A missing file yields an empty list — combined with
 * fail-closed enforcement in resolveWrite, that means "deny every post" by default.
 * Accepts the canonical { channels: [...] } form or a bare top-level array.
 */
export function loadAllowlist({ env = process.env, readFile = readFileSync, profile } = {}) {
  const path = resolveAllowlistPath(env, profile);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { channels: [] };
    throw err;
  }
  if (!raw.trim()) return { channels: [] }; // empty file → fail-closed empty, same as missing
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MalformedConfigError(path, err.message);
  }
  if (Array.isArray(parsed)) return { channels: parsed };
  return { channels: Array.isArray(parsed.channels) ? parsed.channels : [] };
}

const isSnowflake = (t) => /^\d{17,20}$/.test(t);

/**
 * Build a channel resolver over an allowlist.
 *   resolveWrite(token) — for message sends. Returns { channelId } only if the alias is
 *     listed or the raw id is in the allowlist; otherwise { denied: token }. Fail-closed.
 *   resolveRead(token)  — for reads/reactions (ungated). Any raw id resolves; a known alias
 *     maps to its id; an unknown alias returns { denied } (it can't be resolved to an id).
 *   isAllowedId(id)     — allowlist membership test, used to gate a thread by its parent.
 */
export function makeChannelResolver({ allowlist = { channels: [] } } = {}) {
  const idSet = new Set();
  const aliasMap = new Map(); // lowercased alias -> channelId

  for (const c of allowlist.channels || []) {
    if (!c || !c.channelId) continue;
    idSet.add(String(c.channelId));
    if (c.alias) aliasMap.set(String(c.alias).toLowerCase(), String(c.channelId));
  }

  function resolveWrite(token) {
    const t = String(token).trim();
    if (isSnowflake(t)) return idSet.has(t) ? { channelId: t } : { denied: t };
    const id = aliasMap.get(t.toLowerCase());
    return id ? { channelId: id } : { denied: t };
  }

  function resolveRead(token) {
    const t = String(token).trim();
    if (isSnowflake(t)) return { channelId: t };
    const id = aliasMap.get(t.toLowerCase());
    return id ? { channelId: id } : { denied: t };
  }

  const isAllowedId = (id) => idSet.has(String(id));

  return { resolveWrite, resolveRead, isAllowedId };
}
