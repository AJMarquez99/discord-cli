import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MissingCredentialsError } from '../lib/errors.js';

// `profile` is accepted for forward-compat (aws-style profiles) but unused in v1.
export function resolveConfigPath(env = process.env, _profile) {
  if (env.DISCORD_CLI_CONFIG) return env.DISCORD_CLI_CONFIG;
  return join(env.HOME || '', '.config', 'discord-cli', 'credentials.json');
}

/**
 * Resolve the bot token. Precedence:
 *   1. DISCORD_BOT_TOKEN env var
 *   2. JSON file at resolveConfigPath() ({ botToken })
 * Throws MissingCredentialsError if neither yields a token.
 */
export function resolveCredentials({ env = process.env, readFile = readFileSync, profile } = {}) {
  if (env.DISCORD_BOT_TOKEN) {
    return { botToken: env.DISCORD_BOT_TOKEN, source: 'env' };
  }

  const path = resolveConfigPath(env, profile);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new MissingCredentialsError(path);
    throw err;
  }

  const parsed = JSON.parse(raw);
  if (!parsed.botToken) throw new MissingCredentialsError(path);
  return { botToken: parsed.botToken, source: path };
}
