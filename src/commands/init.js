import { dirname } from 'node:path';
import { resolveAllowlistPath } from '../allowlist.js';
import { resolveSettingsPath } from '../config.js';
import { resolveConfigPath } from '../auth/credentials.js';
import { ALLOWLIST_TEMPLATE, CONFIG_TEMPLATE } from '../lib/templates.js';
import { MissingCredentialsError, MalformedConfigError } from '../lib/errors.js';

/**
 * Scaffold ~/.config/discord-cli/ config files (non-clobbering) and report the
 * credential status with next-step guidance. Never writes secrets — `login`
 * handles the bot token.
 */
export async function runInit(_opts, deps) {
  const env = deps.env;

  const allowlistPath = resolveAllowlistPath(env);
  const configPath = resolveSettingsPath(env);
  const credsPath = resolveConfigPath(env);

  // Ensure config dir(s) exist — dedupe in case allowlist and config share a parent.
  const dirs = [...new Set([dirname(allowlistPath), dirname(configPath)])];
  for (const dir of dirs) {
    deps.ensureDir(dir);
  }

  const created = [];
  const skipped = [];

  const files = [
    [allowlistPath, ALLOWLIST_TEMPLATE],
    [configPath, CONFIG_TEMPLATE],
  ];

  for (const [path, template] of files) {
    if (deps.fileExists(path)) {
      skipped.push(path);
    } else {
      created.push(path);
    }
    // Safety net: writeFileIfAbsent only writes if the file is absent.
    deps.writeFileIfAbsent(path, template);
  }

  // Credential check — never prompt or write secrets, just report status.
  let credentials;
  try {
    deps.resolveCredentials();
    credentials = 'ok';
  } catch (e) {
    if (e instanceof MissingCredentialsError) {
      credentials = 'missing';
    } else if (e instanceof MalformedConfigError) {
      credentials = 'malformed';
    } else {
      throw e;
    }
  }

  // Build next-steps guidance.
  const nextSteps = [];
  if (credentials !== 'ok') {
    nextSteps.push(
      'Create a bot at https://discord.com/developers/applications (Bot → Reset Token); enable the Message Content intent for reads',
      `Save the token with: discord login  (writes ${credsPath}, chmod 600), or set DISCORD_BOT_TOKEN`,
    );
  }
  nextSteps.push(
    `Add allowed channel ids to ${allowlistPath} (find them with: discord channels --server <guildId>)`,
    'Verify with: discord doctor',
  );

  // `dir` is included for JSON consumers; formatInit doesn't print it.
  const dir = dirname(allowlistPath);

  return { dir, created, skipped, credentials, nextSteps };
}
