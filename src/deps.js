import { resolveCredentials } from './auth/credentials.js';
import { createDiscordClient } from './api/discord.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
import { appendAudit, readAudit } from './lib/audit.js';

export const defaultDeps = {
  resolveCredentials: () => resolveCredentials({}),
  createClient: (creds) => createDiscordClient(creds),
  loadAllowlist: () => loadAllowlist({}),
  loadConfig: () => loadConfig({}),
  appendAudit: (entry) => appendAudit(entry, {}),
  readAudit: (opts) => readAudit(opts || {}),
  now: () => new Date().toISOString(),
};
