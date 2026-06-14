import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveCredentials } from './auth/credentials.js';
import { createDiscordClient } from './api/discord.js';
import { loadAllowlist } from './allowlist.js';
import { loadConfig } from './config.js';
import { appendAudit, readAudit } from './lib/audit.js';

export const defaultDeps = {
  env: process.env,
  resolveCredentials: () => resolveCredentials({}),
  createClient: (creds) => createDiscordClient(creds),
  loadAllowlist: () => loadAllowlist({}),
  loadConfig: () => loadConfig({}),
  appendAudit: (entry) => appendAudit(entry, {}),
  readAudit: (opts) => readAudit(opts || {}),
  now: () => new Date().toISOString(),
  fileExists: (p) => existsSync(p),
  ensureDir: (d) => mkdirSync(d, { recursive: true }),
  readFile: (p) => readFileSync(p, 'utf8'),
  writeFile: (p, data, mode) => writeFileSync(p, data, mode != null ? { mode } : undefined),
  writeFileIfAbsent: (p, c) => {
    if (!existsSync(p)) writeFileSync(p, c);
  },
  prompt: (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(q, (answer) => {
        rl.close();
        resolve(answer);
      });
    }),
  promptHidden: (q) =>
    new Promise((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl._writeToOutput = (s) => {
        if (s.includes(q)) process.stdout.write(s);
      };
      rl.question(q, (answer) => {
        process.stdout.write('\n');
        rl.close();
        resolve(answer);
      });
    }),
};
