import { resolveCredentials } from './auth/credentials.js';
import { createDiscordClient } from './api/discord.js';
import { loadAllowlist } from './allowlist.js';

// Default wiring injected into command handlers. Tests substitute their own.
export const defaultDeps = {
  resolveCredentials: () => resolveCredentials({}),
  createClient: (creds) => createDiscordClient(creds),
  loadAllowlist: () => loadAllowlist({}),
  now: () => new Date().toISOString(),
};
