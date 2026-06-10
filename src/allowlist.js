import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MalformedConfigError, ChannelNotAllowedError } from './lib/errors.js';

export function resolveAllowlistPath(env = process.env) {
  if (env.DISCORD_ALLOWLIST) return env.DISCORD_ALLOWLIST;
  return join(env.HOME || '', '.config', 'discord-cli', 'allowlist.json');
}

// Normalize a channels entry (string id, {channelId}, or v0.1 {alias,channelId}) → id string | null.
function channelIdOf(entry) {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (entry.channelId != null) return String(entry.channelId);
  return null;
}

/**
 * Load the allowlist → { channels: string[], servers: string[] }. Missing/empty → empty (fail-closed).
 * Accepts { channels:[...], servers:[...] }, a bare array (channels only), and the v0.1 alias-object
 * form (channelId extracted, alias ignored). Malformed JSON → MalformedConfigError.
 */
export function loadAllowlist({ env = process.env, readFile = readFileSync } = {}) {
  const path = resolveAllowlistPath(env);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { channels: [], servers: [] };
    throw err;
  }
  if (!raw.trim()) return { channels: [], servers: [] };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MalformedConfigError(path, err.message);
  }
  const rawChannels = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.channels) ? parsed.channels : []);
  const channels = rawChannels.map(channelIdOf).filter(Boolean);
  const servers = (Array.isArray(parsed) ? [] : (Array.isArray(parsed.servers) ? parsed.servers : []))
    .map((s) => (s == null ? null : String(s))).filter(Boolean);
  return { channels, servers };
}

export function isAllowedChannel(allowlist, channelId) {
  return (allowlist.channels || []).includes(String(channelId));
}
export function isAllowedServer(allowlist, guildId) {
  return (allowlist.servers || []).includes(String(guildId));
}
// Back-compat name used by thread-parent gating.
export const isAllowedId = isAllowedChannel;

/**
 * Resolve+authorize a channel for CONTENT access. Returns { channelId, allowlisted } or throws
 * ChannelNotAllowedError. In open mode a non-allowlisted channel is permitted only if its guild
 * is allowlisted — discovered via client.getChannel(id).guild_id.
 */
export async function gateChannel({ channelId, mode = 'restricted', allowlist, client }) {
  const id = String(channelId);
  if (isAllowedChannel(allowlist, id)) return { channelId: id, allowlisted: true };
  if (mode === 'open') {
    const ch = await client.getChannel(id);
    const guildId = ch && ch.guild_id;
    if (guildId && isAllowedServer(allowlist, guildId)) return { channelId: id, allowlisted: false };
  }
  throw new ChannelNotAllowedError(id);
}

/**
 * Gate a THREAD target by its parent channel. Returns { channelId: threadId, allowlisted, parentId }.
 */
export async function gateThreadParent({ threadId, mode = 'restricted', allowlist, client }) {
  const thread = await client.getChannel(threadId);
  const parentId = thread && thread.parent_id;
  if (!parentId) throw new ChannelNotAllowedError(String(threadId), 'thread has no parent channel');
  if (isAllowedChannel(allowlist, parentId)) return { channelId: String(threadId), allowlisted: true, parentId: String(parentId) };
  if (mode === 'open') {
    const parent = await client.getChannel(parentId);
    const guildId = parent && parent.guild_id;
    if (guildId && isAllowedServer(allowlist, guildId)) {
      return { channelId: String(threadId), allowlisted: false, parentId: String(parentId) };
    }
  }
  throw new ChannelNotAllowedError(String(threadId), `parent channel ${parentId} not allowed`);
}
