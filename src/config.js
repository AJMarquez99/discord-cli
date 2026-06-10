import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MalformedConfigError } from './lib/errors.js';

export function resolveSettingsPath(env = process.env) {
  if (env.DISCORD_CLI_SETTINGS) return env.DISCORD_CLI_SETTINGS;
  return join(env.HOME || '', '.config', 'discord-cli', 'config.json');
}

const DEFAULTS = { mode: 'restricted', auditLog: { enabled: true, logBody: false } };

export function loadConfig({ env = process.env, readFile = readFileSync } = {}) {
  const path = resolveSettingsPath(env);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULTS, auditLog: { ...DEFAULTS.auditLog } };
    throw err;
  }
  if (!raw.trim()) return { ...DEFAULTS, auditLog: { ...DEFAULTS.auditLog } };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new MalformedConfigError(path, err.message);
  }
  const audit = parsed.auditLog || {};
  return {
    mode: parsed.mode === 'open' ? 'open' : 'restricted',
    auditLog: { enabled: audit.enabled !== false, logBody: audit.logBody === true },
  };
}

export function resolveMode({ config = DEFAULTS, env = process.env, unrestricted = false } = {}) {
  if (unrestricted) return 'open';
  if (env.DISCORD_MODE) return env.DISCORD_MODE === 'open' ? 'open' : 'restricted';
  return config.mode === 'open' ? 'open' : 'restricted';
}
