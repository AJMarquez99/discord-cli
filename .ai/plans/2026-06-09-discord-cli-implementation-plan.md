# discord-cli Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global `discord` CLI (gmail/gsc/gh sibling) that lets agents post messages, read channel history, react, reply, and create threads via Discord's REST API, with a fail-closed channel allowlist gating all message sends.

**Architecture:** Stateless ESM Node CLI on `commander`, mirroring gmail-cli's layout: `bin/` entrypoint → `src/cli.js` (commander wiring + a `handle()` wrapper that renders JSON/table and maps thrown errors to exit codes) → command modules (`src/commands/*.js`) that take `(opts, deps)` and return plain objects. A thin REST client (`src/api/discord.js`) over built-in `fetch` handles Bot auth and 429 retry. Dependencies are injected via `src/deps.js` so tests substitute fakes. Credential and allowlist resolvers accept an optional `profile` argument (unused in v1) so aws-style profiles are a later drop-in.

**Tech Stack:** Node ≥20 (ESM, built-in `fetch`), `commander` for CLI, `vitest` for tests (REST layer mocked). No Discord SDK.

**Reference spec:** `.ai/plans/2026-06-09-discord-cli-design.md`

---

## File Structure

```
bin/discord.js                 thin entrypoint → src/cli.js run()
src/cli.js                     commander wiring, handle() wrapper, global --format/--profile
src/deps.js                    defaultDeps: injected wiring for command handlers
src/auth/credentials.js        bot-token resolution (env → file), profile-aware signature
src/allowlist.js               load allowlist + makeChannelResolver (write gate / read resolve)
src/api/discord.js             REST client: fetch + Bot auth + 429 retry + endpoint methods
src/commands/post.js           runPost   — send message / reply / post-in-thread (gated)
src/commands/read.js           runRead   — fetch recent messages (ungated)
src/commands/react.js          runReact  — add reaction (ungated)
src/commands/thread.js         runThreadCreate — start thread from a message (gated)
src/commands/allow.js          runAllowList — print allowlist (read-only)
src/commands/doctor.js         runDoctor — verify token via GET /users/@me
src/lib/errors.js              EXIT_CODES + DiscordError subclasses
src/lib/format.js              printJson + per-command table formatters
test/*.test.js                 vitest unit tests per module + one end-to-end through run()
package.json                   bin: { "discord": "./bin/discord.js" }, type: module, node>=20
vitest.config.js
README.md                      setup (bot creation, intent, invite) + command reference
.ai/                           knowledge / guidelines / plans (this plan lives here)
```

**Allowlist file format** (`~/.config/discord-cli/allowlist.json`), canonical wrapped form (loader also accepts a bare top-level array):
```json
{ "channels": [ { "alias": "general", "channelId": "123456789012345678", "serverId": "987654321098765432" } ] }
```

**Credentials file format** (`~/.config/discord-cli/credentials.json`):
```json
{ "botToken": "xxxxx.yyyyy.zzzzz" }
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `bin/discord.js`
- Create: `vitest.config.js`
- Modify: `.gitignore` (already has `node_modules/`, `.config/`, `*.log` from spec commit)
- Test: `test/smoke.test.js`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "discord-cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Personal Discord CLI for agentic sessions (gh/gmail/gsc sibling). Post, read, react, and thread via the Discord REST API; fail-closed channel allowlist on sends.",
  "bin": {
    "discord": "./bin/discord.js"
  },
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Write `bin/discord.js`**

```js
#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv);
```

- [ ] **Step 3: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Write the smoke test `test/smoke.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('package', () => {
  it('declares the discord bin and is ESM', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.type).toBe('module');
    expect(pkg.bin.discord).toBe('./bin/discord.js');
  });
});
```

- [ ] **Step 5: Install deps and run the smoke test**

Run: `npm install && npm run test:run -- test/smoke.test.js`
Expected: 1 passing test. (`src/cli.js` doesn't exist yet — that's fine, the smoke test doesn't import it.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json bin/discord.js vitest.config.js test/smoke.test.js
git commit -m "chore: scaffold discord-cli project"
```

---

## Task 2: Errors and exit codes

**Files:**
- Create: `src/lib/errors.js`
- Test: `test/errors.test.js`

- [ ] **Step 1: Write the failing test `test/errors.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  EXIT_CODES,
  DiscordError,
  MissingCredentialsError,
  InvalidInputError,
  ChannelNotAllowedError,
  DiscordApiError,
} from '../src/lib/errors.js';

describe('errors', () => {
  it('exposes the exit-code table', () => {
    expect(EXIT_CODES).toEqual({ GENERIC: 1, CONFIG: 2, FORBIDDEN: 3 });
  });

  it('MissingCredentialsError is a CONFIG error mentioning the path', () => {
    const e = new MissingCredentialsError('/tmp/creds.json');
    expect(e).toBeInstanceOf(DiscordError);
    expect(e.exitCode).toBe(EXIT_CODES.CONFIG);
    expect(e.message).toContain('/tmp/creds.json');
    expect(e.message).toContain('DISCORD_BOT_TOKEN');
  });

  it('InvalidInputError is a CONFIG error', () => {
    expect(new InvalidInputError('bad').exitCode).toBe(EXIT_CODES.CONFIG);
  });

  it('ChannelNotAllowedError is FORBIDDEN and names the denied target', () => {
    const e = new ChannelNotAllowedError('random');
    expect(e.exitCode).toBe(EXIT_CODES.FORBIDDEN);
    expect(e.message).toContain('random');
    expect(e.denied).toBe('random');
  });

  it('DiscordApiError formats status + message + code and is GENERIC', () => {
    const e = new DiscordApiError(403, { message: 'Missing Permissions', code: 50013 });
    expect(e.exitCode).toBe(EXIT_CODES.GENERIC);
    expect(e.status).toBe(403);
    expect(e.message).toContain('403');
    expect(e.message).toContain('Missing Permissions');
    expect(e.message).toContain('50013');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/errors.test.js`
Expected: FAIL — cannot resolve `../src/lib/errors.js`.

- [ ] **Step 3: Write `src/lib/errors.js`**

```js
// Exit codes mirror gmail-cli / gsc-cli: 2 = user-fixable config, 3 = allowlist block, 1 = everything else.
export const EXIT_CODES = {
  GENERIC: 1, // unexpected / Discord API / network failure
  CONFIG: 2, // user-fixable config (missing token, bad input, unknown alias)
  FORBIDDEN: 3, // target channel blocked by the allowlist policy
};

export class DiscordError extends Error {
  constructor(message, exitCode = EXIT_CODES.GENERIC) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class MissingCredentialsError extends DiscordError {
  constructor(path) {
    super(
      `No Discord bot token found.\n` +
        `Set DISCORD_BOT_TOKEN, or create ${path} with:\n` +
        `  { "botToken": "your-bot-token" }\n` +
        `Create a bot at https://discord.com/developers/applications (Bot → Reset Token).`,
      EXIT_CODES.CONFIG,
    );
  }
}

export class InvalidInputError extends DiscordError {
  constructor(message) {
    super(message, EXIT_CODES.CONFIG);
  }
}

export class ChannelNotAllowedError extends DiscordError {
  constructor(denied, detail) {
    super(
      `Blocked by allowlist — not permitted to post to: ${denied}` +
        (detail ? ` (${detail})` : '') +
        `\nNothing was sent. Add the channel (alias + channelId) to the allowlist, then retry.\n` +
        `Allowlist: ~/.config/discord-cli/allowlist.json (DISCORD_ALLOWLIST overrides). See \`discord allow list\`.`,
      EXIT_CODES.FORBIDDEN,
    );
    this.denied = denied;
  }
}

export class DiscordApiError extends DiscordError {
  constructor(status, data) {
    const msg = data && data.message ? data.message : 'Unknown error';
    const code = data && data.code != null ? ` (code ${data.code})` : '';
    super(`Discord API ${status}: ${msg}${code}`, EXIT_CODES.GENERIC);
    this.status = status;
    this.data = data;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/errors.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors.js test/errors.test.js
git commit -m "feat: error types and exit-code table"
```

---

## Task 3: Credential resolution

**Files:**
- Create: `src/auth/credentials.js`
- Test: `test/credentials.test.js`

- [ ] **Step 1: Write the failing test `test/credentials.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { resolveCredentials, resolveConfigPath } from '../src/auth/credentials.js';
import { MissingCredentialsError } from '../src/lib/errors.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveConfigPath', () => {
  it('honors DISCORD_CLI_CONFIG override', () => {
    expect(resolveConfigPath({ DISCORD_CLI_CONFIG: '/x/c.json' })).toBe('/x/c.json');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveConfigPath({ HOME: '/home/me' })).toBe('/home/me/.config/discord-cli/credentials.json');
  });
});

describe('resolveCredentials', () => {
  it('prefers DISCORD_BOT_TOKEN env over file', () => {
    const creds = resolveCredentials({ env: { DISCORD_BOT_TOKEN: 'tok-env' }, readFile: enoent });
    expect(creds).toEqual({ botToken: 'tok-env', source: 'env' });
  });

  it('reads botToken from the config file', () => {
    const creds = resolveCredentials({
      env: { HOME: '/home/me' },
      readFile: () => JSON.stringify({ botToken: 'tok-file' }),
    });
    expect(creds.botToken).toBe('tok-file');
    expect(creds.source).toBe('/home/me/.config/discord-cli/credentials.json');
  });

  it('throws MissingCredentialsError when the file is absent', () => {
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile: enoent }))
      .toThrow(MissingCredentialsError);
  });

  it('throws MissingCredentialsError when the file lacks botToken', () => {
    expect(() => resolveCredentials({ env: { HOME: '/home/me' }, readFile: () => '{}' }))
      .toThrow(MissingCredentialsError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/credentials.test.js`
Expected: FAIL — cannot resolve `../src/auth/credentials.js`.

- [ ] **Step 3: Write `src/auth/credentials.js`**

```js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/credentials.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/credentials.js test/credentials.test.js
git commit -m "feat: bot-token credential resolution"
```

---

## Task 4: Allowlist + channel resolver

**Files:**
- Create: `src/allowlist.js`
- Test: `test/allowlist.test.js`

- [ ] **Step 1: Write the failing test `test/allowlist.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { loadAllowlist, resolveAllowlistPath, makeChannelResolver } from '../src/allowlist.js';

const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };

describe('resolveAllowlistPath', () => {
  it('honors DISCORD_ALLOWLIST override', () => {
    expect(resolveAllowlistPath({ DISCORD_ALLOWLIST: '/x/a.json' })).toBe('/x/a.json');
  });
  it('defaults under ~/.config/discord-cli', () => {
    expect(resolveAllowlistPath({ HOME: '/home/me' })).toBe('/home/me/.config/discord-cli/allowlist.json');
  });
});

describe('loadAllowlist', () => {
  it('returns empty channels when the file is missing (fail-closed)', () => {
    expect(loadAllowlist({ env: { HOME: '/h' }, readFile: enoent })).toEqual({ channels: [] });
  });
  it('reads the wrapped { channels: [...] } form', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify({ channels: [{ alias: 'g', channelId: '1' }] }) });
    expect(al.channels).toHaveLength(1);
  });
  it('also accepts a bare top-level array', () => {
    const al = loadAllowlist({ env: { HOME: '/h' }, readFile: () => JSON.stringify([{ alias: 'g', channelId: '1' }]) });
    expect(al.channels).toHaveLength(1);
  });
});

describe('makeChannelResolver', () => {
  const allowlist = { channels: [{ alias: 'general', channelId: '111111111111111111' }] };

  it('resolveWrite maps a known alias to its channelId', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('general')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveWrite allows a raw id that is in the allowlist', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('111111111111111111')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveWrite denies a raw id not in the allowlist', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('222222222222222222')).toEqual({ denied: '222222222222222222' });
  });
  it('resolveWrite denies an unknown alias', () => {
    expect(makeChannelResolver({ allowlist }).resolveWrite('random')).toEqual({ denied: 'random' });
  });
  it('resolveWrite on an empty allowlist denies everything (fail-closed)', () => {
    expect(makeChannelResolver({ allowlist: { channels: [] } }).resolveWrite('111111111111111111')).toEqual({ denied: '111111111111111111' });
  });

  it('resolveRead accepts any raw id (ungated)', () => {
    expect(makeChannelResolver({ allowlist: { channels: [] } }).resolveRead('333333333333333333')).toEqual({ channelId: '333333333333333333' });
  });
  it('resolveRead maps a known alias', () => {
    expect(makeChannelResolver({ allowlist }).resolveRead('general')).toEqual({ channelId: '111111111111111111' });
  });
  it('resolveRead denies an unknown alias (cannot resolve to an id)', () => {
    expect(makeChannelResolver({ allowlist }).resolveRead('mystery')).toEqual({ denied: 'mystery' });
  });

  it('isAllowedId reflects allowlist membership (for thread-parent gating)', () => {
    const r = makeChannelResolver({ allowlist });
    expect(r.isAllowedId('111111111111111111')).toBe(true);
    expect(r.isAllowedId('999999999999999999')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/allowlist.test.js`
Expected: FAIL — cannot resolve `../src/allowlist.js`.

- [ ] **Step 3: Write `src/allowlist.js`**

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  const parsed = JSON.parse(raw);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/allowlist.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/allowlist.js test/allowlist.test.js
git commit -m "feat: channel allowlist with fail-closed write resolver"
```

---

## Task 5: Discord REST client

**Files:**
- Create: `src/api/discord.js`
- Test: `test/discord-client.test.js`

- [ ] **Step 1: Write the failing test `test/discord-client.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { createDiscordClient } from '../src/api/discord.js';
import { DiscordApiError } from '../src/lib/errors.js';

// Build a fake fetch returning a Response-like object.
function fakeRes({ status = 200, json = null, headers = {} } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (json == null ? '' : JSON.stringify(json)),
  };
}

const creds = { botToken: 'tok' };

describe('createDiscordClient', () => {
  it('sends Bot auth and parses JSON on getMe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: { id: '1', username: 'bot' } }));
    const client = createDiscordClient(creds, { fetchImpl });
    const me = await client.getMe();
    expect(me.username).toBe('bot');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/users/@me');
    expect(init.headers.Authorization).toBe('Bot tok');
  });

  it('createMessage POSTs the payload as JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: { id: '99', content: 'hi' } }));
    const client = createDiscordClient(creds, { fetchImpl });
    const msg = await client.createMessage('123', { content: 'hi' });
    expect(msg.id).toBe('99');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/123/messages');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ content: 'hi' });
  });

  it('getMessages maps limit/before/after to query params and drops nullish', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ json: [] }));
    const client = createDiscordClient(creds, { fetchImpl });
    await client.getMessages('123', { limit: 5, before: 'abc', after: undefined });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://discord.com/api/v10/channels/123/messages?limit=5&before=abc');
  });

  it('addReaction URL-encodes the emoji and targets @me', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ status: 204 }));
    const client = createDiscordClient(creds, { fetchImpl });
    await client.addReaction('123', '456', '👍');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(url).toBe(`https://discord.com/api/v10/channels/123/messages/456/reactions/${encodeURIComponent('👍')}/@me`);
  });

  it('retries once on 429 honoring retry-after, then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeRes({ status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(fakeRes({ json: { id: '1', username: 'bot' } }));
    const sleep = vi.fn().mockResolvedValue();
    const client = createDiscordClient(creds, { fetchImpl, sleep });
    const me = await client.getMe();
    expect(me.username).toBe('bot');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(0);
  });

  it('throws DiscordApiError on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeRes({ status: 403, json: { message: 'Missing Permissions', code: 50013 } }));
    const client = createDiscordClient(creds, { fetchImpl });
    await expect(client.getMe()).rejects.toBeInstanceOf(DiscordApiError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/discord-client.test.js`
Expected: FAIL — cannot resolve `../src/api/discord.js`.

- [ ] **Step 3: Write `src/api/discord.js`**

```js
import { DiscordApiError } from '../lib/errors.js';

const API_BASE = 'https://discord.com/api/v10';
const MAX_RETRIES = 2;

/**
 * Minimal Discord REST client over fetch. Adds Bot auth, retries 429 honoring Retry-After,
 * parses JSON, and surfaces non-OK responses as DiscordApiError. fetchImpl/sleep are
 * injectable for tests.
 */
export function createDiscordClient(creds, { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const headers = {
    Authorization: `Bot ${creds.botToken}`,
    'Content-Type': 'application/json',
    'User-Agent': 'discord-cli (https://github.com/AJMarquez99/discord-cli, 0.1.0)',
  };

  async function request(method, path, { body, query } = {}) {
    let url = API_BASE + path;
    if (query) {
      const qs = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)]),
      ).toString();
      if (qs) url += `?${qs}`;
    }
    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, init);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after')) || 1;
        await sleep(retryAfter * 1000);
        continue;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new DiscordApiError(res.status, data);
      return data;
    }
  }

  return {
    getMe: () => request('GET', '/users/@me'),
    getChannel: (channelId) => request('GET', `/channels/${channelId}`),
    getMessages: (channelId, { limit, before, after } = {}) =>
      request('GET', `/channels/${channelId}/messages`, { query: { limit, before, after } }),
    createMessage: (channelId, payload) =>
      request('POST', `/channels/${channelId}/messages`, { body: payload }),
    addReaction: (channelId, messageId, emoji) =>
      request('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`),
    startThreadFromMessage: (channelId, messageId, payload) =>
      request('POST', `/channels/${channelId}/messages/${messageId}/threads`, { body: payload }),
  };
}
```

Note on the 429 test: `retry-after: '0'` → `Number('0')` is `0`, which is falsy, so `|| 1` makes it `1`, and `sleep(1 * 1000)`. Adjust the test expectation: the assertion should be `expect(sleep).toHaveBeenCalledWith(1000)`. Update Step 1's 429 test line accordingly before running:

```js
    expect(sleep).toHaveBeenCalledWith(1000);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/discord-client.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api/discord.js test/discord-client.test.js
git commit -m "feat: Discord REST client with Bot auth and 429 retry"
```

---

## Task 6: Output formatting

**Files:**
- Create: `src/lib/format.js`
- Test: `test/format.test.js`

- [ ] **Step 1: Write the failing test `test/format.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { formatPost, formatRead, formatReact, formatThread, formatAllowList, formatDoctor } from '../src/lib/format.js';

describe('table formatters', () => {
  it('formatPost shows channel and message id', () => {
    const out = formatPost({ channelId: '123', messageId: '99', content: 'hi' });
    expect(out).toContain('123');
    expect(out).toContain('99');
  });

  it('formatRead lists one line per message', () => {
    const out = formatRead({ channelId: '1', count: 2, messages: [
      { id: 'a', author: 'alice', content: 'hello', timestamp: 't1' },
      { id: 'b', author: 'bob', content: 'world', timestamp: 't2' },
    ]});
    expect(out.split('\n').filter((l) => l.includes('alice') || l.includes('bob'))).toHaveLength(2);
  });

  it('formatRead handles an empty channel', () => {
    expect(formatRead({ channelId: '1', count: 0, messages: [] })).toContain('no messages');
  });

  it('formatReact confirms the reaction', () => {
    expect(formatReact({ channelId: '1', messageId: '2', emoji: '👍', reacted: true })).toContain('👍');
  });

  it('formatThread shows the new thread id and name', () => {
    const out = formatThread({ parentChannelId: '1', threadId: '50', name: 'topic' });
    expect(out).toContain('50');
    expect(out).toContain('topic');
  });

  it('formatAllowList renders entries, and a note when empty', () => {
    expect(formatAllowList({ count: 0, channels: [] })).toContain('empty');
    const out = formatAllowList({ count: 1, channels: [{ alias: 'general', channelId: '111', serverId: null }] });
    expect(out).toContain('general');
    expect(out).toContain('111');
  });

  it('formatDoctor reports status and bot identity', () => {
    const out = formatDoctor({ ok: true, bot: 'mybot', botId: '7', source: 'env', credentials: 'ok', api: 'ok', allowlist: 3 });
    expect(out).toContain('ok');
    expect(out).toContain('mybot');
    expect(out).toContain('3');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/format.test.js`
Expected: FAIL — cannot resolve `../src/lib/format.js`.

- [ ] **Step 3: Write `src/lib/format.js`**

```js
export function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

export function formatPost(r) {
  return [`posted → channel ${r.channelId}`, `message-id: ${r.messageId}`, r.replyTo ? `reply-to: ${r.replyTo}` : null]
    .filter(Boolean)
    .join('\n');
}

export function formatRead(r) {
  if (!r.messages.length) return `(no messages in channel ${r.channelId})`;
  return r.messages
    .map((m) => `${m.timestamp}  ${m.author || '(unknown)'}: ${m.content || '(no content)'}`)
    .join('\n');
}

export function formatReact(r) {
  return `reacted ${r.emoji} → message ${r.messageId} in channel ${r.channelId}`;
}

export function formatThread(r) {
  return `thread created: ${r.name} (${r.threadId}) under channel ${r.parentChannelId}`;
}

export function formatAllowList(r) {
  if (r.count === 0) return '(allowlist empty — no channel can be posted to)';
  return r.channels
    .map((c) => `${c.alias ? c.alias + '  ' : ''}${c.channelId}${c.serverId ? '  (server ' + c.serverId + ')' : ''}`)
    .join('\n');
}

export function formatDoctor(r) {
  const lines = [
    `status:      ${r.ok ? 'ok' : 'FAILED'}`,
    `bot:         ${r.bot || '(unknown)'}${r.botId ? '  (' + r.botId + ')' : ''}`,
    `source:      ${r.source || '(none)'}`,
    `credentials: ${r.credentials}`,
    `api:         ${r.api}`,
    `allowlist:   ${r.allowlist} channel(s)`,
  ];
  if (r.error) lines.push('', r.error);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/format.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.js test/format.test.js
git commit -m "feat: JSON and table output formatters"
```

---

## Task 7: doctor command

**Files:**
- Create: `src/commands/doctor.js`
- Test: `test/doctor.test.js`

- [ ] **Step 1: Write the failing test `test/doctor.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { runDoctor } from '../src/commands/doctor.js';
import { MissingCredentialsError } from '../src/lib/errors.js';

const baseDeps = (over = {}) => ({
  loadAllowlist: () => ({ channels: [{ channelId: '1' }, { channelId: '2' }] }),
  resolveCredentials: () => ({ botToken: 'tok', source: 'env' }),
  createClient: () => ({ getMe: async () => ({ id: '7', username: 'mybot' }) }),
  ...over,
});

describe('runDoctor', () => {
  it('reports ok with bot identity and allowlist count', async () => {
    const r = await runDoctor({}, baseDeps());
    expect(r.ok).toBe(true);
    expect(r.bot).toBe('mybot');
    expect(r.botId).toBe('7');
    expect(r.allowlist).toBe(2);
  });

  it('reports missing credentials without throwing', async () => {
    const r = await runDoctor({}, baseDeps({
      resolveCredentials: () => { throw new MissingCredentialsError('/c.json'); },
    }));
    expect(r.ok).toBe(false);
    expect(r.credentials).toBe('missing');
    expect(r.api).toBe('skipped');
  });

  it('reports an API failure without throwing', async () => {
    const r = await runDoctor({}, baseDeps({
      createClient: () => ({ getMe: async () => { throw new Error('401 Unauthorized'); } }),
    }));
    expect(r.ok).toBe(false);
    expect(r.credentials).toBe('ok');
    expect(r.api).toContain('401');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/doctor.test.js`
Expected: FAIL — cannot resolve `../src/commands/doctor.js`.

- [ ] **Step 3: Write `src/commands/doctor.js`**

```js
import { MissingCredentialsError } from '../lib/errors.js';

/**
 * Health check: is a token present, and does Discord accept it? Never throws — returns a
 * diagnostic envelope so callers always get a readable report.
 */
export async function runDoctor(opts, deps) {
  const allowlist = deps.loadAllowlist().channels.filter((c) => c && c.channelId).length;

  let creds;
  try {
    creds = deps.resolveCredentials();
  } catch (err) {
    if (err instanceof MissingCredentialsError) {
      return { ok: false, credentials: 'missing', api: 'skipped', error: err.message, allowlist };
    }
    throw err;
  }

  const client = deps.createClient(creds);
  try {
    const me = await client.getMe();
    return { ok: true, bot: me.username, botId: me.id, source: creds.source, credentials: 'ok', api: 'ok', allowlist };
  } catch (err) {
    return { ok: false, source: creds.source, credentials: 'ok', api: err.message || String(err), allowlist };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/doctor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.js test/doctor.test.js
git commit -m "feat: doctor command"
```

---

## Task 8: read command

**Files:**
- Create: `src/commands/read.js`
- Test: `test/read.test.js`

- [ ] **Step 1: Write the failing test `test/read.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { runRead } from '../src/commands/read.js';
import { InvalidInputError } from '../src/lib/errors.js';

const apiMessages = [
  { id: 'a', author: { id: 'u1', username: 'alice', global_name: 'Alice' }, content: 'hello', timestamp: 't1',
    reactions: [{ emoji: { name: '👍' }, count: 2 }], attachments: [] },
];

const deps = (getMessages) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ getMessages }),
});

describe('runRead', () => {
  it('requires --channel', async () => {
    await expect(runRead({}, deps(async () => []))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('resolves an alias and returns shaped messages', async () => {
    const getMessages = vi.fn().mockResolvedValue(apiMessages);
    const r = await runRead({ channel: 'general', limit: '5' }, deps(getMessages));
    expect(getMessages).toHaveBeenCalledWith('111111111111111111', { limit: 5, before: undefined, after: undefined });
    expect(r.count).toBe(1);
    expect(r.messages[0]).toMatchObject({ id: 'a', author: 'Alice', content: 'hello' });
    expect(r.messages[0].reactions).toEqual([{ emoji: '👍', count: 2 }]);
  });

  it('accepts a raw channel id (ungated)', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    const r = await runRead({ channel: '222222222222222222' }, deps(getMessages));
    expect(r.channelId).toBe('222222222222222222');
    expect(getMessages).toHaveBeenCalledWith('222222222222222222', { limit: 25, before: undefined, after: undefined });
  });

  it('caps limit at 100 and floors invalid values to 25', async () => {
    const getMessages = vi.fn().mockResolvedValue([]);
    await runRead({ channel: '222222222222222222', limit: '500' }, deps(getMessages));
    expect(getMessages.mock.calls[0][1].limit).toBe(100);
    await runRead({ channel: '222222222222222222', limit: 'abc' }, deps(getMessages));
    expect(getMessages.mock.calls[1][1].limit).toBe(25);
  });

  it('rejects an unknown alias with a config error', async () => {
    await expect(runRead({ channel: 'mystery' }, deps(async () => []))).rejects.toBeInstanceOf(InvalidInputError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/read.test.js`
Expected: FAIL — cannot resolve `../src/commands/read.js`.

- [ ] **Step 3: Write `src/commands/read.js`**

```js
import { InvalidInputError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

export async function runRead(opts, deps) {
  if (!opts.channel) throw new InvalidInputError('Provide --channel <alias|id>.');

  const { resolveRead } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveRead(opts.channel);
  if (r.denied) {
    throw new InvalidInputError(
      `Unknown channel alias: ${r.denied}. Use a known alias (see \`discord allow list\`) or a raw channel ID.`,
    );
  }

  let limit = opts.limit != null ? parseInt(opts.limit, 10) : 25;
  if (Number.isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const messages = await client.getMessages(r.channelId, { limit, before: opts.before, after: opts.after });

  return {
    channelId: r.channelId,
    count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author ? m.author.global_name || m.author.username : null,
      authorId: m.author ? m.author.id : null,
      content: m.content,
      timestamp: m.timestamp,
      reactions: (m.reactions || []).map((x) => ({ emoji: x.emoji.name, count: x.count })),
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, url: a.url })),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/read.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/read.js test/read.test.js
git commit -m "feat: read command"
```

---

## Task 9: post command (send / reply / post-in-thread, allowlist-gated)

**Files:**
- Create: `src/commands/post.js`
- Test: `test/post.test.js`

- [ ] **Step 1: Write the failing test `test/post.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { runPost } from '../src/commands/post.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const allowlist = { channels: [{ alias: 'general', channelId: '111111111111111111' }] };

const deps = (over = {}) => ({
  loadAllowlist: () => allowlist,
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({
    createMessage: over.createMessage || vi.fn().mockResolvedValue({ id: '99', content: 'hi' }),
    getChannel: over.getChannel || vi.fn().mockResolvedValue({ id: 't', parent_id: '111111111111111111' }),
  }),
});

describe('runPost', () => {
  it('requires a target channel or thread', async () => {
    await expect(runPost({ message: 'hi' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('requires non-empty content', async () => {
    await expect(runPost({ channel: 'general', message: '   ' }, deps())).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('posts to an allowlisted alias', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const r = await runPost({ channel: 'general', message: 'hi' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', { content: 'hi' });
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '99' });
  });

  it('blocks a non-allowlisted channel with a FORBIDDEN error', async () => {
    await expect(runPost({ channel: 'random', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('blocks a raw channel id not in the allowlist', async () => {
    await expect(runPost({ channel: '222222222222222222', message: 'hi' }, deps())).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });

  it('adds message_reference when --reply-to is given', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    await runPost({ channel: 'general', message: 'hi', replyTo: '42' }, deps({ createMessage }));
    expect(createMessage).toHaveBeenCalledWith('111111111111111111', { content: 'hi', message_reference: { message_id: '42' } });
  });

  it('posts into a thread when its parent is allowlisted', async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: '99', content: 'hi' });
    const getChannel = vi.fn().mockResolvedValue({ id: 'thread1', parent_id: '111111111111111111' });
    const r = await runPost({ thread: 'thread1', message: 'hi' }, deps({ createMessage, getChannel }));
    expect(getChannel).toHaveBeenCalledWith('thread1');
    expect(createMessage).toHaveBeenCalledWith('thread1', { content: 'hi' });
    expect(r.channelId).toBe('thread1');
  });

  it('blocks a thread whose parent is not allowlisted', async () => {
    const getChannel = vi.fn().mockResolvedValue({ id: 'thread1', parent_id: '999999999999999999' });
    await expect(runPost({ thread: 'thread1', message: 'hi' }, deps({ getChannel }))).rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/post.test.js`
Expected: FAIL — cannot resolve `../src/commands/post.js`.

- [ ] **Step 3: Write `src/commands/post.js`**

```js
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

/**
 * Send a message. Target is a thread (--thread) if given, else a channel (--channel).
 * Allowlist-gated: a channel target must resolve via the allowlist; a thread target is
 * gated by its parent channel (fetched via getChannel). Optional --reply-to threads a reply.
 */
export async function runPost(opts, deps) {
  const content = opts.message;
  if (!opts.channel && !opts.thread) {
    throw new InvalidInputError('Provide --channel <alias|id> (or --thread <threadId>).');
  }
  if (!content || !String(content).trim()) {
    throw new InvalidInputError('Empty message. Provide --message or pipe the body on stdin.');
  }

  const { resolveWrite, isAllowedId } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);

  let targetChannelId;
  if (opts.thread) {
    const thread = await client.getChannel(opts.thread);
    const parentId = thread && thread.parent_id;
    if (!parentId || !isAllowedId(parentId)) {
      throw new ChannelNotAllowedError(opts.thread, `parent channel ${parentId || '(unknown)'} not allowlisted`);
    }
    targetChannelId = opts.thread;
  } else {
    const r = resolveWrite(opts.channel);
    if (r.denied) throw new ChannelNotAllowedError(r.denied);
    targetChannelId = r.channelId;
  }

  const payload = { content: String(content) };
  if (opts.replyTo) payload.message_reference = { message_id: opts.replyTo };

  const msg = await client.createMessage(targetChannelId, payload);
  return { channelId: targetChannelId, messageId: msg.id, content: msg.content, replyTo: opts.replyTo || null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/post.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/commands/post.js test/post.test.js
git commit -m "feat: post command with allowlist gating, replies, and threads"
```

---

## Task 10: react command

**Files:**
- Create: `src/commands/react.js`
- Test: `test/react.test.js`

- [ ] **Step 1: Write the failing test `test/react.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { runReact } from '../src/commands/react.js';
import { InvalidInputError } from '../src/lib/errors.js';

const deps = (addReaction) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ addReaction }),
});

describe('runReact', () => {
  it('requires channel, message, and emoji', async () => {
    await expect(runReact({ channel: 'general', message: '1' }, deps(vi.fn()))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('reacts on an allowlisted alias', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: 'general', message: '42', emoji: '👍' }, deps(addReaction));
    expect(addReaction).toHaveBeenCalledWith('111111111111111111', '42', '👍');
    expect(r).toMatchObject({ channelId: '111111111111111111', messageId: '42', emoji: '👍', reacted: true });
  });

  it('reacts on a raw channel id (ungated)', async () => {
    const addReaction = vi.fn().mockResolvedValue(null);
    const r = await runReact({ channel: '222222222222222222', message: '42', emoji: '🎉' }, deps(addReaction));
    expect(r.channelId).toBe('222222222222222222');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/react.test.js`
Expected: FAIL — cannot resolve `../src/commands/react.js`.

- [ ] **Step 3: Write `src/commands/react.js`**

```js
import { InvalidInputError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

export async function runReact(opts, deps) {
  if (!opts.channel || !opts.message || !opts.emoji) {
    throw new InvalidInputError('Provide --channel <alias|id>, --message <messageId>, and --emoji.');
  }

  const { resolveRead } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveRead(opts.channel);
  if (r.denied) {
    throw new InvalidInputError(`Unknown channel alias: ${r.denied}. Use a known alias or a raw channel ID.`);
  }

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  await client.addReaction(r.channelId, opts.message, opts.emoji);
  return { channelId: r.channelId, messageId: opts.message, emoji: opts.emoji, reacted: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/react.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/react.js test/react.test.js
git commit -m "feat: react command"
```

---

## Task 11: thread create command

**Files:**
- Create: `src/commands/thread.js`
- Test: `test/thread.test.js`

- [ ] **Step 1: Write the failing test `test/thread.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { runThreadCreate } from '../src/commands/thread.js';
import { InvalidInputError, ChannelNotAllowedError } from '../src/lib/errors.js';

const deps = (startThreadFromMessage) => ({
  loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
  resolveCredentials: () => ({ botToken: 'tok' }),
  createClient: () => ({ startThreadFromMessage }),
});

describe('runThreadCreate', () => {
  it('requires channel, from, and name', async () => {
    await expect(runThreadCreate({ channel: 'general', from: '1' }, deps(vi.fn()))).rejects.toBeInstanceOf(InvalidInputError);
  });

  it('creates a thread from a message in an allowlisted channel', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    const r = await runThreadCreate({ channel: 'general', from: '42', name: 'topic' }, deps(startThreadFromMessage));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic' });
    expect(r).toMatchObject({ parentChannelId: '111111111111111111', threadId: '50', name: 'topic' });
  });

  it('passes auto_archive_duration when --auto-archive is given', async () => {
    const startThreadFromMessage = vi.fn().mockResolvedValue({ id: '50', name: 'topic' });
    await runThreadCreate({ channel: 'general', from: '42', name: 'topic', autoArchive: '1440' }, deps(startThreadFromMessage));
    expect(startThreadFromMessage).toHaveBeenCalledWith('111111111111111111', '42', { name: 'topic', auto_archive_duration: 1440 });
  });

  it('blocks a non-allowlisted channel', async () => {
    await expect(runThreadCreate({ channel: 'random', from: '42', name: 'topic' }, deps(vi.fn())))
      .rejects.toBeInstanceOf(ChannelNotAllowedError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/thread.test.js`
Expected: FAIL — cannot resolve `../src/commands/thread.js`.

- [ ] **Step 3: Write `src/commands/thread.js`**

```js
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';
import { makeChannelResolver } from '../allowlist.js';

/**
 * Start a thread from an existing message. Gated by the parent --channel (allowlisted).
 * `discord thread create --channel <alias|id> --from <messageId> --name "..."`.
 */
export async function runThreadCreate(opts, deps) {
  if (!opts.channel || !opts.from || !opts.name) {
    throw new InvalidInputError('Provide --channel <alias|id>, --from <messageId>, and --name "...".');
  }

  const { resolveWrite } = makeChannelResolver({ allowlist: deps.loadAllowlist() });
  const r = resolveWrite(opts.channel);
  if (r.denied) throw new ChannelNotAllowedError(r.denied);

  const payload = { name: opts.name };
  if (opts.autoArchive) payload.auto_archive_duration = parseInt(opts.autoArchive, 10);

  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const thread = await client.startThreadFromMessage(r.channelId, opts.from, payload);
  return { parentChannelId: r.channelId, threadId: thread.id, name: thread.name };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/thread.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/thread.js test/thread.test.js
git commit -m "feat: thread create command"
```

---

## Task 12: allow list command

**Files:**
- Create: `src/commands/allow.js`
- Test: `test/allow.test.js`

- [ ] **Step 1: Write the failing test `test/allow.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { runAllowList } from '../src/commands/allow.js';

describe('runAllowList', () => {
  it('normalizes entries and counts them', async () => {
    const deps = { loadAllowlist: () => ({ channels: [
      { alias: 'general', channelId: '111', serverId: '999' },
      { channelId: '222' },
      { alias: 'bad' }, // no channelId — dropped
    ] }) };
    const r = await runAllowList({}, deps);
    expect(r.count).toBe(2);
    expect(r.channels[0]).toEqual({ alias: 'general', channelId: '111', serverId: '999' });
    expect(r.channels[1]).toEqual({ alias: null, channelId: '222', serverId: null });
  });

  it('returns zero for an empty allowlist', async () => {
    const r = await runAllowList({}, { loadAllowlist: () => ({ channels: [] }) });
    expect(r.count).toBe(0);
    expect(r.channels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- test/allow.test.js`
Expected: FAIL — cannot resolve `../src/commands/allow.js`.

- [ ] **Step 3: Write `src/commands/allow.js`**

```js
// Read-only view of the channel allowlist. Editing is done by hand in the JSON file.
export async function runAllowList(opts, deps) {
  const { channels } = deps.loadAllowlist();
  const normalized = channels
    .filter((c) => c && c.channelId)
    .map((c) => ({ alias: c.alias || null, channelId: String(c.channelId), serverId: c.serverId || null }));
  return { count: normalized.length, channels: normalized };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- test/allow.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/allow.js test/allow.test.js
git commit -m "feat: allow list command"
```

---

## Task 13: deps wiring + CLI program

**Files:**
- Create: `src/deps.js`
- Create: `src/cli.js`
- Test: `test/cli.test.js`

- [ ] **Step 1: Write `src/deps.js`**

```js
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
```

- [ ] **Step 2: Write the failing test `test/cli.test.js`**

This is the end-to-end test: drive `run()` with injected deps and assert the command result is produced. It exercises commander wiring, the `handle()` wrapper, and exit-code mapping.

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../src/cli.js';

function fakeDeps(over = {}) {
  return {
    loadAllowlist: () => ({ channels: [{ alias: 'general', channelId: '111111111111111111' }] }),
    resolveCredentials: () => ({ botToken: 'tok', source: 'env' }),
    createClient: () => ({
      getMe: async () => ({ id: '7', username: 'mybot' }),
      createMessage: async () => ({ id: '99', content: 'hi' }),
      getMessages: async () => [],
      addReaction: async () => null,
      getChannel: async () => ({ id: 't', parent_id: '111111111111111111' }),
      startThreadFromMessage: async () => ({ id: '50', name: 'topic' }),
    }),
    now: () => '2026-06-09T00:00:00.000Z',
    ...over,
  };
}

let out, err;
beforeEach(() => {
  process.exitCode = 0;
  out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});
afterEach(() => { out.mockRestore(); err.mockRestore(); process.exitCode = 0; });

const argv = (...args) => ['node', 'discord', ...args];

describe('cli run()', () => {
  it('doctor prints JSON and exits 0', async () => {
    await run(argv('doctor'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"ok": true');
    expect(process.exitCode).toBe(0);
  });

  it('post to an allowlisted alias succeeds', async () => {
    await run(argv('post', '--channel', 'general', '--message', 'hi'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('"messageId": "99"');
    expect(process.exitCode).toBe(0);
  });

  it('post to a non-allowlisted channel exits 3 and writes nothing to stdout', async () => {
    await run(argv('post', '--channel', 'random', '--message', 'hi'), fakeDeps());
    expect(process.exitCode).toBe(3);
    const stderr = err.mock.calls.map((c) => c[0]).join('');
    expect(stderr).toContain('Blocked by allowlist');
  });

  it('missing token on doctor still exits 0 (doctor never throws) but reports missing', async () => {
    const deps = fakeDeps({ resolveCredentials: () => { const e = new Error(); e.name = 'MissingCredentialsError'; throw e; } });
    // Use the real error type instead:
  });

  it('--format table renders a human summary for doctor', async () => {
    await run(argv('--format', 'table', 'doctor'), fakeDeps());
    const printed = out.mock.calls.map((c) => c[0]).join('');
    expect(printed).toContain('status:');
    expect(printed).toContain('mybot');
  });

  it('read maps --limit and prints messages JSON', async () => {
    const getMessages = vi.fn().mockResolvedValue([
      { id: 'a', author: { username: 'alice' }, content: 'hello', timestamp: 't1' },
    ]);
    await run(argv('read', '--channel', 'general', '--limit', '5'), fakeDeps({ createClient: () => ({ getMessages }) }));
    expect(getMessages).toHaveBeenCalledWith('111111111111111111', { limit: 5, before: undefined, after: undefined });
  });
});
```

Note: delete the stub fourth test (`missing token on doctor…`) — it was a placeholder thought; the doctor missing-token path is already covered in `test/doctor.test.js`. Keep the other five.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:run -- test/cli.test.js`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 4: Write `src/cli.js`**

```js
import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { runPost } from './commands/post.js';
import { runRead } from './commands/read.js';
import { runReact } from './commands/react.js';
import { runThreadCreate } from './commands/thread.js';
import { runAllowList } from './commands/allow.js';
import { runDoctor } from './commands/doctor.js';
import { DiscordError, EXIT_CODES } from './lib/errors.js';
import { printJson, formatPost, formatRead, formatReact, formatThread, formatAllowList, formatDoctor } from './lib/format.js';

// Read piped stdin (non-TTY) so agents can stream a body: `echo "..." | discord post --channel x`.
async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function handle(fn, { table, preprocess } = {}, deps = defaultDeps) {
  return async (...actionArgs) => {
    const cmd = actionArgs[actionArgs.length - 1];
    const opts = cmd.opts();
    let root = cmd;
    while (root.parent) root = root.parent;
    const globalOpts = root.opts();
    try {
      if (preprocess) await preprocess(opts);
      const result = await fn(opts, deps);
      if (globalOpts.format === 'table' && table) {
        process.stdout.write(table(result) + '\n');
      } else {
        printJson(result);
      }
    } catch (err) {
      process.stderr.write((err.message || String(err)) + '\n');
      process.exitCode = err instanceof DiscordError ? err.exitCode : EXIT_CODES.GENERIC;
    }
  };
}

export function buildProgram(deps = defaultDeps) {
  const program = new Command();
  program
    .name('discord')
    .description('Personal Discord CLI for agentic sessions (gh/gmail/gsc sibling)')
    .version('0.1.0')
    .option('--format <format>', 'output format: json|table', 'json')
    .option('--profile <name>', 'config profile (reserved; single identity in v1)');

  program
    .command('post')
    .description('Post a message to a channel (allowlist-gated)')
    .option('--channel <alias|id>', 'target channel alias or id')
    .option('--thread <threadId>', 'post into a thread (gated by its parent channel)')
    .option('--message <text>', 'message content (or pipe it on stdin)')
    .option('--reply-to <messageId>', 'reply to this message')
    .action(
      handle(
        runPost,
        {
          table: formatPost,
          preprocess: async (opts) => {
            if (!opts.message) {
              const piped = await readStdin();
              if (piped.trim()) opts.message = piped.replace(/\n+$/, '');
            }
          },
        },
        deps,
      ),
    );

  program
    .command('read')
    .description('Read recent messages from a channel')
    .option('--channel <alias|id>', 'channel alias or id')
    .option('--limit <n>', 'max messages (1-100, default 25)')
    .option('--before <messageId>', 'only messages before this id')
    .option('--after <messageId>', 'only messages after this id')
    .action(handle(runRead, { table: formatRead }, deps));

  program
    .command('react')
    .description('Add a reaction to a message')
    .option('--channel <alias|id>', 'channel alias or id')
    .option('--message <messageId>', 'target message id')
    .option('--emoji <emoji>', 'unicode emoji or custom name:id')
    .action(handle(runReact, { table: formatReact }, deps));

  const thread = program.command('thread').description('Thread operations');
  thread
    .command('create')
    .description('Create a thread from a message (allowlist-gated by parent channel)')
    .option('--channel <alias|id>', 'parent channel alias or id')
    .option('--from <messageId>', 'message to start the thread from')
    .option('--name <name>', 'thread name')
    .option('--auto-archive <minutes>', 'auto-archive duration: 60|1440|4320|10080')
    .action(handle(runThreadCreate, { table: formatThread }, deps));

  const allow = program.command('allow').description('Inspect the channel allowlist (edit ~/.config/discord-cli/allowlist.json by hand)');
  allow
    .command('list')
    .description('List allowed channels and aliases')
    .action(handle(runAllowList, { table: formatAllowList }, deps));

  program
    .command('doctor')
    .description('Verify the bot token and report identity + allowlist count')
    .action(handle(runDoctor, { table: formatDoctor }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:run`
Expected: PASS — all suites green.

- [ ] **Step 6: Manual smoke (no network — expect a clean config error)**

Run: `node bin/discord.js doctor`
Expected: with no token configured, JSON envelope `{ "ok": false, "credentials": "missing", ... }` and exit code reflects doctor returning normally (0). Verify `node bin/discord.js --help` lists all commands.

- [ ] **Step 7: Commit**

```bash
git add src/deps.js src/cli.js test/cli.test.js
git commit -m "feat: CLI wiring for all commands"
```

---

## Task 14: README and project docs

**Files:**
- Create: `README.md`
- Create: `.ai/knowledge/architecture.md`

- [ ] **Step 1: Write `README.md`**

Document: what it is (gh/gmail/gsc sibling), install (`npm install && npm install -g .`), Discord setup (create application + bot, **enable the Message Content privileged intent**, invite the bot with View Channel / Read Message History / Send Messages / Send Messages in Threads / Create Public Threads / Add Reactions, get the channel IDs via Developer Mode), credential config (`DISCORD_BOT_TOKEN` or `~/.config/discord-cli/credentials.json`), allowlist file format (`{ "channels": [...] }`), the fail-closed write/ungated-read safety model, full command reference with examples for `post`/`read`/`react`/`thread create`/`allow list`/`doctor`, exit codes (0/1/2/3), and a "Phase 2 — MCP wrapper" note.

Use this skeleton, filling each section with real content drawn from this plan and the design spec:

```markdown
# discord-cli

A personal Discord CLI for agentic sessions — the `gh`/`gmail`/`gsc` sibling. Post messages,
read channel history, react, reply, and create threads via the Discord REST API. All message
sends are gated by a fail-closed channel allowlist.

## Install
\`\`\`bash
cd ~/Code/Projects/discord-cli && npm install && npm install -g .
\`\`\`

## Discord setup
1. Create an application + bot at https://discord.com/developers/applications.
2. **Enable the Message Content privileged intent** (Bot → Privileged Gateway Intents) — required to read message content.
3. Invite the bot (OAuth2 URL Generator, scope `bot`) with: View Channel, Read Message History, Send Messages, Send Messages in Threads, Create Public Threads, Add Reactions.
4. Enable Developer Mode in Discord (Settings → Advanced) to copy channel IDs.

## Credentials
Set \`DISCORD_BOT_TOKEN\`, or create \`~/.config/discord-cli/credentials.json\`:
\`\`\`json
{ "botToken": "your-bot-token" }
\`\`\`
Override the path with \`DISCORD_CLI_CONFIG\`.

## Allowlist (fail-closed on posts)
\`~/.config/discord-cli/allowlist.json\` (override \`DISCORD_ALLOWLIST\`):
\`\`\`json
{ "channels": [ { "alias": "general", "channelId": "123...", "serverId": "987..." } ] }
\`\`\`
Posts/replies/thread-creates may only target allowlisted channels (threads are gated by their parent). Reads and reactions work anywhere the bot can see. No file ⇒ nothing is postable.

## Commands
- \`discord post --channel <alias|id> --message "..."\` — \`--reply-to <id>\`, \`--thread <id>\`, or pipe body on stdin
- \`discord read --channel <alias|id> [--limit N] [--before <id>] [--after <id>]\`
- \`discord react --channel <alias|id> --message <id> --emoji 👍\`
- \`discord thread create --channel <alias|id> --from <messageId> --name "..." [--auto-archive 1440]\`
- \`discord allow list\`
- \`discord doctor\`

All commands print JSON by default; add \`--format table\` for a human summary.

## Exit codes
\`0\` ok · \`1\` API/network failure · \`2\` user-fixable config · \`3\` blocked by allowlist.

## Phase 2 — MCP wrapper (planned)
A thin MCP server will expose these same operations as structured tools, delegating to the
command modules so the allowlist gate is shared. Not built yet.
\`\`\`
```

- [ ] **Step 2: Write `.ai/knowledge/architecture.md`**

A short durable note: the layered structure (bin → cli → commands → api/allowlist/auth), the dependency-injection pattern via `deps.js`, the fail-closed allowlist invariant (writes gated, reads/reactions ungated, threads gated by parent), and the profile-ready resolver signatures for future multi-bot support.

- [ ] **Step 3: Commit**

```bash
git add README.md .ai/knowledge/architecture.md
git commit -m "docs: README and architecture knowledge note"
```

---

## Task 15: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `npm run test:run`
Expected: all suites pass (smoke, errors, credentials, allowlist, discord-client, format, doctor, read, post, react, thread, allow, cli).

- [ ] **Step 2: Verify the CLI help and a gated failure end-to-end**

Run:
```bash
node bin/discord.js --help
DISCORD_ALLOWLIST=/tmp/discord-cli-nonexistent.json DISCORD_BOT_TOKEN=fake node bin/discord.js post --channel random --message hi; echo "exit=$?"
```
Expected: help lists all commands; the post attempt prints "Blocked by allowlist" to stderr and `exit=3` (a **nonexistent** allowlist path → ENOENT → `loadAllowlist` returns `{ channels: [] }` → fail-closed, so the block happens before any network call). NOTE: do not point `DISCORD_ALLOWLIST` at an empty file or `/dev/null` — `loadAllowlist` calls `JSON.parse` on the contents, and an empty string throws a `SyntaxError` (exit 1), not a fail-closed block. Pointing at a path that does not exist is the correct way to demonstrate fail-closed. (Follow-up: harden `loadAllowlist` to treat an empty/malformed file as a clear CONFIG error — see plan notes.)

- [ ] **Step 3: Confirm clean git status and review the diff against the spec's acceptance criteria**

Run: `git status && git log --oneline`
Cross-check the 6 acceptance criteria in `.ai/plans/2026-06-09-discord-cli-design.md` are each satisfied by a task above.

---

## Self-Review Notes (author)

- **Spec coverage:** post/read/react/thread-create/allow/doctor → Tasks 7–13; auth → Task 3; allowlist + fail-closed + thread-parent gating → Tasks 4, 9; REST client + 429 → Task 5; JSON/table + exit codes → Tasks 6, 13; profile-ready signatures → Tasks 3, 4 (`profile` param, unused). README documents the Message Content intent caveat → Task 14. MCP wrapper is explicitly out of scope (Phase 2 note) per the design.
- **Allowlist format reconciliation:** the design spec showed a bare array; the loader (Task 4) accepts both that and the canonical `{ channels: [...] }` form, which the README documents — no contradiction.
- **429 test gotcha:** `retry-after: '0'` resolves to `1000` ms via the `|| 1` fallback; Task 5 Step 3 notes the corrected assertion.
- **cli.test.js stub:** Task 13 Step 2 explicitly instructs deleting the placeholder fourth test; doctor's missing-token path is covered in Task 7.
