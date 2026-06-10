# discord-cli v0.2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each task is TDD: write failing test → confirm fail → implement → confirm pass → commit. Keep the full suite green at the end of every task.

**Goal:** Evolve discord-cli to v0.2.0 — allowlist gates all channel content (read/react join writes), a server-wide `channels` discovery command, a restricted↔open mode scoped to allowlisted servers, an audit log, default mention safety, and dry-run. Drop channel aliases.

**Architecture:** Same layered ESM CLI. New modules `src/config.js`, `src/lib/audit.js`; allowlist rewritten to an ID-only `{channels, servers}` shape with an async `gateChannel` content gate; REST client gains `getGuildChannels`; content commands route through the gate and gain mode/dry-run/audit/mentions; two new commands (`channels`, `audit`).

**Reference spec:** `.ai/plans/2026-06-09-discord-cli-v0.2.0-design.md` (read §1–§11).

**Current state (v0.1.0, on `main`):** `src/lib/errors.js` (EXIT_CODES + DiscordError/MissingCredentials/InvalidInput/ChannelNotAllowed/DiscordApi/MalformedConfig), `src/auth/credentials.js`, `src/allowlist.js` (resolveAllowlistPath, loadAllowlist→`{channels:[{alias,channelId}]}`, makeChannelResolver→{resolveWrite,resolveRead,isAllowedId}), `src/api/discord.js` (getMe, getChannel, getMessages, createMessage, addReaction, startThreadFromMessage), `src/lib/format.js`, `src/commands/{post,read,react,thread,allow,doctor}.js`, `src/deps.js`, `src/cli.js`. Tests in `test/*.test.js` (78 passing).

---

## Task 1: Version bump + `config.js` (mode + audit prefs)

**Files:** Modify `package.json` (version → `0.2.0`); Create `src/config.js`, `test/config.test.js`.

**Behavior:**
- `resolveSettingsPath(env)` → `env.DISCORD_CLI_SETTINGS` else `<HOME>/.config/discord-cli/config.json`.
- `loadConfig({ env, readFile })` → returns `{ mode, auditLog: { enabled, logBody } }`.
  - Missing file (ENOENT) → defaults `{ mode: 'restricted', auditLog: { enabled: true, logBody: false } }`.
  - Empty/whitespace file → same defaults.
  - Malformed JSON → throw `MalformedConfigError(path, err.message)`.
  - Parsed: `mode` is `'open'` only if exactly `'open'`, else `'restricted'`. `auditLog.enabled` defaults true (only `false` disables); `auditLog.logBody` defaults false.
- `resolveMode({ config, env, unrestricted })` → `'open'` if `unrestricted` truthy; else if `env.DISCORD_MODE` set → `'open'` when `=== 'open'` else `'restricted'`; else `config.mode`.

**Code:**
```js
// src/config.js
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
```

**Tests (`test/config.test.js`):** path override + default; ENOENT → defaults; empty → defaults; malformed → throws `MalformedConfigError`; `mode:'open'` parsed; `auditLog.enabled:false` honored; `logBody:true` honored; `resolveMode`: unrestricted flag wins; `DISCORD_MODE=open` → open, other value → restricted; falls back to config.mode.

**Commit:** `feat: config.js (mode + audit prefs) and version bump to 0.2.0`

---

## Task 2: `src/lib/audit.js` (append + read action log)

**Files:** Create `src/lib/audit.js`, `test/audit.test.js`.

**Behavior:**
- `resolveAuditPath(env)` → `env.DISCORD_AUDIT_LOG` else `<HOME>/.config/discord-cli/audit.jsonl`.
- `appendAudit(entry, { env, appendFile })` → `appendFile(path, JSON.stringify(entry) + '\n')`. Caller handles failures (do not swallow here; the command wraps it).
- `readAudit({ limit = 20, env, readFile })` → read file; if ENOENT → `{ entries: [] }`; split on newlines, drop blanks, `JSON.parse` each (skip unparseable lines defensively), reverse to newest-first, slice to `limit` → `{ entries }`.

**Code:**
```js
// src/lib/audit.js
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function resolveAuditPath(env = process.env) {
  if (env.DISCORD_AUDIT_LOG) return env.DISCORD_AUDIT_LOG;
  return join(env.HOME || '', '.config', 'discord-cli', 'audit.jsonl');
}

export function appendAudit(entry, { env = process.env, appendFile = appendFileSync } = {}) {
  appendFile(resolveAuditPath(env), JSON.stringify(entry) + '\n');
}

export function readAudit({ limit = 20, env = process.env, readFile = readFileSync } = {}) {
  const path = resolveAuditPath(env);
  let raw;
  try {
    raw = readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { entries: [] };
    throw err;
  }
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const parsed = [];
  for (const line of lines) {
    try { parsed.push(JSON.parse(line)); } catch { /* skip malformed line */ }
  }
  parsed.reverse();
  return { entries: parsed.slice(0, limit) };
}
```

**Tests:** path override + default; `appendAudit` calls injected `appendFile` with `path` and a single-line JSON + `\n`; `readAudit` ENOENT → `{entries:[]}`; newest-first ordering; respects `limit`; skips malformed lines.

**Commit:** `feat: audit log append/read helpers`

---

## Task 3: REST client `getGuildChannels`

**Files:** Modify `src/api/discord.js`; Modify `test/discord-client.test.js` (add a case).

**Change:** add to the returned client object:
```js
    getGuildChannels: (guildId) => request('GET', `/guilds/${guildId}/channels`),
```
**Test:** `getGuildChannels('77')` GETs `https://discord.com/api/v10/guilds/77/channels` with Bot auth and returns the parsed array.

**Commit:** `feat: REST getGuildChannels`

---

## Task 4: Allowlist v2 (ID-only `{channels, servers}` + async gate) and consumer migration

This is the core migration. It rewrites `src/allowlist.js`, removes `makeChannelResolver`, and updates every consumer so the suite stays green. Content commands route through the new gate and become mode-aware. (Guardrails — mentions/dry-run/audit — come in Tasks 5–6.)

**Files:** Modify `src/allowlist.js`, `src/deps.js`, `src/commands/{post,read,react,thread,allow,doctor}.js`, `src/lib/format.js`; update `test/allowlist.test.js`, and the affected command tests.

### 4a. `src/allowlist.js` — new shape + gate

```js
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
 * Accepts: { channels:[...], servers:[...] }, a bare array (channels only), and the v0.1 alias-object
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
 * ChannelNotAllowedError. In open mode, a non-allowlisted channel is permitted only if its guild
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
```

### 4b. `src/deps.js` — wire config + audit + now

```js
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
```

### 4c. Content commands → use the gate (mode-aware), no guardrails yet

Each command resolves mode once: `const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });` (import `resolveMode` from `../config.js`).

- **`src/commands/read.js`:** require `--channel`; `const { channelId } = await gateChannel({ channelId: opts.channel, mode, allowlist: deps.loadAllowlist(), client })` (build client first). Then `getMessages` as before. A non-allowlisted channel now throws `ChannelNotAllowedError` (exit 3). Remove the unknown-alias path.
- **`src/commands/react.js`:** require channel/message/emoji; gate via `gateChannel`; then `addReaction`.
- **`src/commands/post.js`:** require channel-or-thread + non-empty content; if `opts.thread` → `gateThreadParent({threadId, mode, allowlist, client})` (target=thread); else `gateChannel`. Then `createMessage`. (Mentions/dry-run/audit added in Task 5.)
- **`src/commands/thread.js`:** require channel/from/name; `gateChannel({channelId: opts.channel, ...})`; then `startThreadFromMessage`. (Dry-run/audit in Task 6.)
- **`src/commands/allow.js`:** return `{ channelCount, channels, serverCount, servers }` from the new shape (ids).
- **`src/commands/doctor.js`:** add mode + servers. Compute `const config = deps.loadConfig()` (guard malformed like allowlist: wrap in try/catch → still report). Add `mode: resolveMode({config, env: process.env})`, `servers: allowlist.servers.length`, `allowlist: allowlist.channels.length`. Keep never-throw.

### 4d. `src/lib/format.js` — update for new shapes

- `formatAllowList(r)`: list `r.channels` (ids), then a `servers:` line; empty note when both empty.
- `formatDoctor(r)`: add the mode line per spec §7 and a `servers:` line.
- `formatRead`: unchanged (already id/author/content based).

**Tests (rewrite/extend):**
- `test/allowlist.test.js`: new shape parsing (`{channels,servers}`, bare array, v0.1 alias-object back-compat, malformed→throw, empty→empty); `isAllowedChannel`/`isAllowedServer`; `gateChannel` restricted (allowlisted id ok; non-allowlisted throws); `gateChannel` open (allowlisted id ok no API; raw id whose guild∈servers ok via injected client.getChannel; raw id wrong guild throws; open with 0 servers → non-allowlisted throws); `gateThreadParent` restricted (parent allowlisted ok; not → throws) and open (parent guild∈servers ok).
- Update `test/{read,react,post,thread,allow,doctor}.test.js` to the new deps (inject `loadConfig`, `createClient` with `getChannel`) and gate semantics: read/react now throw `ChannelNotAllowedError` on non-allowlisted (exit 3) in restricted mode; post unchanged behavior in restricted; doctor reports `mode`/`servers`.

**Commit:** `feat: allowlist v2 (id-only {channels,servers}) with mode-aware content gate`

---

## Task 5: `post` guardrails — mention safety + dry-run + audit

**Files:** Modify `src/commands/post.js`, `src/lib/mentions.js` (new), `src/lib/format.js`; update `test/post.test.js`.

- **`src/lib/mentions.js`:** `buildAllowedMentions({ allowEveryone, allowRoles, isReply })` → `{ parse }` where `parse` starts `['users']`, add `'everyone'` if `allowEveryone`, `'roles'` if `allowRoles`; include `replied_user: true` when `isReply`.
  ```js
  export function buildAllowedMentions({ allowEveryone = false, allowRoles = false, isReply = false } = {}) {
    const parse = ['users'];
    if (allowEveryone) parse.push('everyone');
    if (allowRoles) parse.push('roles');
    const out = { parse };
    if (isReply) out.replied_user = true;
    return out;
  }
  ```
- **`post.js`:** after gating to `{ channelId: target, allowlisted }`:
  - `const allowed_mentions = buildAllowedMentions({ allowEveryone: opts.allowEveryone, allowRoles: opts.allowRoles, isReply: !!opts.replyTo })`.
  - payload `{ content, allowed_mentions, message_reference? }`.
  - **dry-run:** if `opts.dryRun`, return `{ dryRun:true, action:'post', targetChannelId: target, blocked:false, mode, allowlisted, content, allowedMentions: allowed_mentions, replyTo: opts.replyTo||null }` WITHOUT calling the API or audit. If the gate threw, that's caught at the command boundary? No — dry-run must REPORT blocks, not throw. So in post.js, wrap the gate in try/catch when `opts.dryRun`: on `ChannelNotAllowedError`, return `{ dryRun:true, action:'post', targetChannelId:null, blocked:true, reason: err.message, mode, content, allowedMentions, replyTo }` (exit 0). On a real run, let it throw.
  - **audit:** after a successful `createMessage`, append via `deps.appendAudit` unless disabled. Build entry `{ ts: deps.now(), action:'post', channelId: target, messageId: msg.id, mode, allowlisted }`; include `body: content` if `deps.loadConfig().auditLog.logBody || opts.logBody`. Skip if `opts.noAudit` or `auditLog.enabled === false`. Wrap in try/catch → on failure `process.stderr.write('warn: audit write failed: ...')`, do not fail.
- **`format.js`:** `formatPost` handles a dry-run result (show `would post → …` / `BLOCKED: reason`).

**Tests:** default `allowed_mentions.parse` is `['users']`; `--allow-everyone` adds `everyone`; reply sets `replied_user:true`; dry-run returns preview, does NOT call `createMessage` or `appendAudit`, and reports `blocked:true` for a non-allowlisted target without throwing; a real post calls `appendAudit` with the right entry; `--no-audit` skips it; audit write failure warns but the post result is still returned.

**Commit:** `feat: post mention-safety, dry-run, and audit logging`

---

## Task 6: `react` + `thread create` — dry-run + audit

**Files:** Modify `src/commands/react.js`, `src/commands/thread.js`; update tests.

- **react.js:** dry-run → `{ dryRun:true, action:'react', targetChannelId, messageId, emoji, blocked, reason?, mode }` (no `addReaction`, no audit). Real → after `addReaction`, `appendAudit({ ts, action:'react', channelId, messageId, emoji, mode, allowlisted })` (respect `--no-audit`/enabled). Same gate try/catch-for-dry-run pattern as post.
- **thread.js:** dry-run → `{ dryRun:true, action:'thread', parentChannelId, from, name, blocked, reason?, mode }`. Real → after `startThreadFromMessage`, `appendAudit({ ts, action:'thread', channelId: parentChannelId, threadId: thread.id, mode, allowlisted })`.
- **format.js:** `formatReact`/`formatThread` handle dry-run/blocked variants.

**Tests:** dry-run previews without calling the API or audit (incl. blocked reporting); real actions append the right audit entry; `--no-audit` honored.

**Commit:** `feat: dry-run and audit for react and thread create`

---

## Task 7: `discord channels` discovery command

**Files:** Create `src/commands/channels.js`, `test/channels.test.js`; Modify `src/lib/format.js` (`formatChannels`).

**Behavior (`runChannels(opts, deps)`):**
- Resolve server: `opts.server` → else `allowlist.servers.length === 1 ? allowlist.servers[0]` → else throw `InvalidInputError('Specify --server <guildId>. Known servers: ' + allowlist.servers.join(', '))`.
- `const list = await client.getGuildChannels(serverId)`.
- Map each → `{ id, name, type: typeName(c.type), parentId: c.parent_id || null, allowlisted: isAllowedChannel(allowlist, c.id) }`.
- `typeName`: `{0:'text',2:'voice',4:'category',5:'announcement',13:'stage',15:'forum'}[t] || ('type:'+t)`.
- If `opts.type`, filter to entries whose `type === opts.type`.
- Return `{ serverId, count: mapped.length, channels: mapped }`. Never fetches messages. Ungated.

**`formatChannels`:** group by category (entries with `type:'category'` as headers; others nested by `parentId`), mark `allowlisted` with a `*`, show `name  id  (type)`.

**Tests:** server resolution (flag, single-server allowlist, error when ambiguous/none); type mapping; allowlisted marking; `--type` filter; returns no message content; calls `getGuildChannels` with the resolved id.

**Commit:** `feat: channels discovery command`

---

## Task 8: `discord audit` viewer command

**Files:** Create `src/commands/audit.js`, `test/audit-command.test.js`; Modify `src/lib/format.js` (`formatAudit`).

**Behavior (`runAudit(opts, deps)`):** `const limit = clamp(parseInt(opts.limit,10)||20, 1, ...)`; `return deps.readAudit({ limit })` → `{ entries }` (newest-first from the lib). 
**`formatAudit`:** one line per entry: `${ts}  ${action}  ch ${channelId}${messageId? ' msg '+messageId:''}${emoji? ' '+emoji:''}  [${mode}]`; empty → `(no audited actions yet)`.

**Tests:** passes limit to `readAudit`; default 20; renders entries; empty note.

**Commit:** `feat: audit viewer command`

---

## Task 9: CLI wiring + flags

**Files:** Modify `src/cli.js`; update `test/cli.test.js`.

- Register `channels` (`--server`, `--type`), `audit` (`--limit`).
- Add global/command flags: `post` gains `--unrestricted`, `--dry-run`, `--no-audit`, `--log-body`, `--allow-everyone`, `--allow-roles`; `read`/`react`/`thread create` gain `--unrestricted` (and `--dry-run`/`--no-audit` for react/thread; read gets `--unrestricted` only). Commander camelCases (`--allow-everyone`→`allowEveryone`, `--no-audit`→`audit:false` so read as `opts.audit===false`; use `opts.noAudit` fallback — set the command code to treat `opts.audit === false || opts.noAudit` as skip).
- Wire new table formatters (`formatChannels`, `formatAudit`) and dry-run-aware `formatPost/React/Thread`.
- Update `defaultDeps` already done in Task 4. Drop alias references in help text/descriptions.
- End-to-end tests via `run()` with injected fake deps (incl. `loadConfig`, `appendAudit`, `readAudit`, `createClient` exposing `getGuildChannels`/`getChannel`): `channels` prints list; `audit` prints entries; `post --dry-run` to a blocked channel exits 0 with `blocked:true`; restricted `read` to a non-allowlisted channel exits 3; open-mode `post` (via `--unrestricted` + a server-allowlisted fake) to a non-allowlisted channel succeeds.

**Commit:** `feat: CLI wiring for channels/audit, mode/dry-run/mention flags`

---

## Task 10: Docs + live config migration

**Files:** Modify `README.md`, `~/.claude/CLAUDE.md` (Discord section), `.ai/knowledge/architecture.md`. Migrate live `~/.config/discord-cli/allowlist.json` and create `~/.config/discord-cli/config.json`.

- **README:** new model (content allowlisted, discovery via `channels`); allowlist `{channels:[ids], servers:[ids]}` (note alias removal + back-compat); `config.json` (mode, auditLog); audit log + `discord audit`; mention safety + `--allow-everyone`; `--dry-run`; open-mode semantics (server-scoped; 0 servers ⇒ only allowlisted channels). Update command reference + the `channels`/`audit` commands. Bump examples to channel IDs.
- **CLAUDE.md Discord section:** update commands (add `channels`, `audit`), allowlist shape (ids + servers), the restricted/open mode + how to enable, mention-safety default, dry-run, audit log. Keep it parallel to the gmail section.
- **architecture.md:** the v0.2.0 model — content gate (`gateChannel`, mode, server scoping), discovery vs content, config/audit modules, mention safety.
- **Live config migration:** rewrite `~/.config/discord-cli/allowlist.json` to `{ "channels": ["123456789012345678"], "servers": ["987654321098765432"] }`; create `~/.config/discord-cli/config.json` = `{ "mode": "restricted", "auditLog": { "enabled": true, "logBody": false } }` (chmod not needed — non-secret). Confirm `discord doctor` still green and `discord allow list` shows the id + server.

**Commit:** `docs: v0.2.0 README, CLAUDE.md, architecture; migrate live config`

---

## Task 11: Full verification

**Files:** none (verification only).

- `npm run test:run` — entire suite green (report count).
- `discord --help` lists `channels` and `audit`; `discord doctor` shows `mode: restricted` and `servers: 1`.
- `discord channels` lists the server's channels with the allowlisted one marked, no message content.
- Restricted block: `discord read --channel <non-allowlisted id>` → exit 3.
- `discord post --channel <allowlisted id> --dry-run --message "hi @everyone"` → preview shows `allowedMentions.parse` excludes everyone; nothing posted; no audit line.
- Cross-check the 6 acceptance criteria in the design spec.

---

## Self-Review Notes (author)

- **Green-at-each-task:** Task 4 is the one large task (it must migrate all consumers when the allowlist shape changes, or the suite breaks); Tasks 5–9 layer features without breaking. Keep this ordering.
- **`--no-audit` commander quirk:** `--no-audit` sets `opts.audit=false`; commands must treat `opts.audit === false || opts.noAudit` as skip. Spelled out in Task 9.
- **Dry-run must not throw on a blocked gate** — Tasks 5/6 wrap the gate in try/catch only when `opts.dryRun`, returning `blocked:true` (exit 0); real runs still throw (exit 3).
- **Open-mode API cost:** `gateChannel`/`gateThreadParent` call `getChannel` only for non-allowlisted ids in open mode — intended (spec §2, §11.3).
- **Back-compat:** loader accepts v0.1 alias-objects (ignoring alias), bare arrays, and the new `{channels,servers}` — so the live file keeps working until migrated in Task 10.
