import { dirname } from 'node:path';
import { resolveConfigPath } from '../auth/credentials.js';
import { InvalidInputError } from '../lib/errors.js';

/**
 * Guided credential setup. Prompts for the Discord bot token (echo OFF), then
 * writes credentials.json at chmod 600.
 *
 * SECURITY: the bot token flows prompt → file only. It is never returned,
 * logged, or included in any error message. It is intentionally NOT accepted as
 * a flag (flags leak into shell history and the process table).
 *
 * @param {object} opts  - { force?: boolean, profile?: string }
 * @param {object} deps  - { env, fileExists, ensureDir, writeFile, promptHidden }
 */
export async function runLogin(opts, deps) {
  const path = resolveConfigPath(deps.env, opts.profile);

  if (deps.fileExists(path) && !opts.force) {
    throw new InvalidInputError(
      `Credentials already exist at ${path}. Re-run with --force to overwrite.`,
    );
  }

  const botToken = (await deps.promptHidden('Discord bot token (hidden): ')).trim();

  if (!botToken) {
    throw new InvalidInputError('Bot token is required.');
  }

  deps.ensureDir(dirname(path));
  deps.writeFile(path, JSON.stringify({ botToken }, null, 2) + '\n', 0o600);

  return { path, written: true };
}
