# discord-cli v0.3.0 — MCP wrapper + follow-ups — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD per task; keep the full suite green at each commit.

**Goal:** Add the Phase-2 MCP server (a second front-end over the command modules) plus two follow-up fixes: `read`/`react` thread symmetry, and a `DISCORD_MODE` typo warning. Bump to 0.3.0.

**Architecture:** The MCP server is a thin stdio server (`@modelcontextprotocol/sdk`) whose tools delegate to the existing `run*(opts, deps)` command functions with `defaultDeps`. All safety (allowlist gate, restricted/open mode, mention-safety, dry-run, audit) is inherited unchanged because the command layer is reused. Tool definitions live as a plain data array (`src/mcp/tools.js`) so arg→opts mapping is unit-testable without the SDK.

**Builds on:** v0.2.0 (`.ai/plans/2026-06-09-discord-cli-v0.2.0-*`). Current: `src/allowlist.js` exports `gateChannel`, `gateThreadParent`, `isAllowedChannel/Server/Id`; `src/config.js` exports `loadConfig`, `resolveMode`; commands are `run*(opts, deps)`; `deps.js` has `defaultDeps`.

---

## Task 1: Follow-up fixes + version bump to 0.3.0

**Files:** `package.json` (0.2.0→0.3.0), `src/cli.js` (`.version` 0.3.0), `src/api/discord.js` (User-Agent 0.3.0), `src/config.js` (`resolveMode` warning), `src/commands/read.js`, `src/commands/react.js`; tests `test/config.test.js`, `test/read.test.js`, `test/react.test.js`, plus add `--thread` flag to read/react in `src/cli.js`.

### 1a. `resolveMode` — warn on an invalid `DISCORD_MODE`
Replace the env branch so an unrecognized value warns once to stderr, then falls back to restricted:
```js
export function resolveMode({ config = DEFAULTS, env = process.env, unrestricted = false } = {}) {
  if (unrestricted) return 'open';
  if (env.DISCORD_MODE) {
    if (env.DISCORD_MODE === 'open') return 'open';
    if (env.DISCORD_MODE !== 'restricted') {
      process.stderr.write(`warn: DISCORD_MODE='${env.DISCORD_MODE}' is not 'open' or 'restricted'; using restricted.\n`);
    }
    return 'restricted';
  }
  return config.mode === 'open' ? 'open' : 'restricted';
}
```
Tests: invalid value → returns `'restricted'` AND writes a stderr warning (spy `process.stderr.write`); `'restricted'` → no warning; `'open'` → `'open'`, no warning. Keep existing resolveMode tests.

### 1b. `read --thread` and `react --thread` (gate by parent, symmetric with `post --thread`)
`src/commands/read.js` — accept either `--channel` or `--thread`:
```js
import { gateChannel, gateThreadParent } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { InvalidInputError } from '../lib/errors.js';

export async function runRead(opts, deps) {
  if (!opts.channel && !opts.thread) throw new InvalidInputError('Provide --channel <id> or --thread <threadId>.');
  const mode = resolveMode({ config: deps.loadConfig(), env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);
  const { channelId } = opts.thread
    ? await gateThreadParent({ threadId: opts.thread, mode, allowlist, client })
    : await gateChannel({ channelId: opts.channel, mode, allowlist, client });

  let limit = opts.limit != null ? parseInt(opts.limit, 10) : 25;
  if (Number.isNaN(limit) || limit < 1) limit = 25;
  if (limit > 100) limit = 100;
  const messages = await client.getMessages(channelId, { limit, before: opts.before, after: opts.after });
  return {
    channelId, count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      author: m.author ? m.author.global_name || m.author.username : null,
      authorId: m.author ? m.author.id : null,
      content: m.content, timestamp: m.timestamp,
      reactions: (m.reactions || []).map((x) => ({ emoji: x.emoji.name, count: x.count })),
      attachments: (m.attachments || []).map((a) => ({ filename: a.filename, url: a.url })),
    })),
  };
}
```
`src/commands/react.js` — accept either `--channel` or `--thread` for the target (keep `--message`/`--emoji` required):
```js
import { gateChannel, gateThreadParent } from '../allowlist.js';
import { resolveMode } from '../config.js';
import { recordAction } from '../lib/audit.js';
import { InvalidInputError, ChannelNotAllowedError } from '../lib/errors.js';

export async function runReact(opts, deps) {
  if ((!opts.channel && !opts.thread) || !opts.message || !opts.emoji) {
    throw new InvalidInputError('Provide --channel <id> (or --thread <threadId>), --message <messageId>, and --emoji.');
  }
  const config = deps.loadConfig();
  const mode = resolveMode({ config, env: process.env, unrestricted: opts.unrestricted });
  const allowlist = deps.loadAllowlist();
  const creds = deps.resolveCredentials();
  const client = deps.createClient(creds);

  let channelId; let allowlisted;
  try {
    const gated = opts.thread
      ? await gateThreadParent({ threadId: opts.thread, mode, allowlist, client })
      : await gateChannel({ channelId: opts.channel, mode, allowlist, client });
    channelId = gated.channelId; allowlisted = gated.allowlisted;
  } catch (err) {
    if (opts.dryRun && err instanceof ChannelNotAllowedError) {
      return { dryRun: true, action: 'react', targetChannelId: null, messageId: opts.message, emoji: opts.emoji, blocked: true, reason: err.message, mode };
    }
    throw err;
  }
  if (opts.dryRun) {
    return { dryRun: true, action: 'react', targetChannelId: channelId, messageId: opts.message, emoji: opts.emoji, blocked: false, reason: null, mode, allowlisted };
  }
  await client.addReaction(channelId, opts.message, opts.emoji);
  recordAction({ append: deps.appendAudit, now: deps.now, config, opts, entry: { action: 'react', channelId, messageId: opts.message, emoji: opts.emoji, mode, allowlisted } });
  return { channelId, messageId: opts.message, emoji: opts.emoji, reacted: true };
}
```
`src/cli.js` — add `.option('--thread <threadId>', '...')` to the `read` and `react` commands.

Tests (`test/read.test.js`, `test/react.test.js`): add cases — `--thread <id>` gates by parent (fake `client.getChannel` returns `{ parent_id: <allowlisted id> }`) and reads/reacts on the thread id; a thread whose parent is NOT allowlisted → `ChannelNotAllowedError`; requiring neither channel nor thread → `InvalidInputError`. Keep existing channel-based tests.

**Commit:** `feat: read/react --thread (parent-gated) + DISCORD_MODE warning; v0.3.0`

---

## Task 2: MCP server

**Files:** `package.json` (deps `@modelcontextprotocol/sdk`, `zod`; bin `discord-mcp`), `bin/discord-mcp.js`, `src/mcp/tools.js`, `src/mcp/server.js`; tests `test/mcp-tools.test.js`, `test/mcp-server.test.js`.

**FIRST:** `npm install @modelcontextprotocol/sdk zod`, then **read the installed SDK's actual API** (its `README`/exports under `node_modules/@modelcontextprotocol/sdk`) and reconcile the `McpServer`/`registerTool`/`StdioServerTransport` usage below with the installed version (the high-level API names can drift between versions). Adjust the server code to match the installed SDK; keep `tools.js` SDK-agnostic.

### 2a. `src/mcp/tools.js` — SDK-agnostic tool table
```js
import { z } from 'zod';
import { runPost } from '../commands/post.js';
import { runRead } from '../commands/read.js';
import { runReact } from '../commands/react.js';
import { runThreadCreate } from '../commands/thread.js';
import { runChannels } from '../commands/channels.js';
import { runAudit } from '../commands/audit.js';
import { runDoctor } from '../commands/doctor.js';
import { runAllowList } from '../commands/allow.js';

// Each tool: { name, description, inputSchema (zod raw shape), command (run* fn), mapArgs (args→opts) }.
export const TOOLS = [
  {
    name: 'discord_post',
    description: 'Post a message to an allowlisted channel (or thread). @everyone/@here/role pings are stripped unless allow_everyone/allow_roles.',
    inputSchema: {
      channel: z.string().optional(), thread: z.string().optional(), message: z.string(),
      reply_to: z.string().optional(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(),
      no_audit: z.boolean().optional(), log_body: z.boolean().optional(),
      allow_everyone: z.boolean().optional(), allow_roles: z.boolean().optional(),
    },
    command: runPost,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, message: a.message, replyTo: a.reply_to, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit, logBody: a.log_body, allowEveryone: a.allow_everyone, allowRoles: a.allow_roles }),
  },
  {
    name: 'discord_read',
    description: 'Read recent messages from an allowlisted channel or thread.',
    inputSchema: { channel: z.string().optional(), thread: z.string().optional(), limit: z.number().optional(), before: z.string().optional(), after: z.string().optional(), unrestricted: z.boolean().optional() },
    command: runRead,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, limit: a.limit, before: a.before, after: a.after, unrestricted: a.unrestricted }),
  },
  {
    name: 'discord_react',
    description: 'Add a reaction to a message in an allowlisted channel or thread.',
    inputSchema: { channel: z.string().optional(), thread: z.string().optional(), message: z.string(), emoji: z.string(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(), no_audit: z.boolean().optional() },
    command: runReact,
    mapArgs: (a) => ({ channel: a.channel, thread: a.thread, message: a.message, emoji: a.emoji, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit }),
  },
  {
    name: 'discord_create_thread',
    description: 'Create a thread from a message in an allowlisted channel.',
    inputSchema: { channel: z.string(), from: z.string(), name: z.string(), auto_archive: z.number().optional(), unrestricted: z.boolean().optional(), dry_run: z.boolean().optional(), no_audit: z.boolean().optional() },
    command: runThreadCreate,
    mapArgs: (a) => ({ channel: a.channel, from: a.from, name: a.name, autoArchive: a.auto_archive, unrestricted: a.unrestricted, dryRun: a.dry_run, noAudit: a.no_audit }),
  },
  {
    name: 'discord_channels',
    description: "List a server's channels (names → ids, type; marks allowlisted). Metadata only.",
    inputSchema: { server: z.string().optional(), type: z.string().optional() },
    command: runChannels,
    mapArgs: (a) => ({ server: a.server, type: a.type }),
  },
  {
    name: 'discord_audit',
    description: 'Show recent audited actions (newest first).',
    inputSchema: { limit: z.number().optional() },
    command: runAudit,
    mapArgs: (a) => ({ limit: a.limit }),
  },
  {
    name: 'discord_doctor',
    description: 'Verify the bot token; report mode, identity, allowlist + server counts.',
    inputSchema: {},
    command: runDoctor,
    mapArgs: () => ({}),
  },
  {
    name: 'discord_allowlist',
    description: 'Show the allowlisted channel ids and server ids.',
    inputSchema: {},
    command: runAllowList,
    mapArgs: () => ({}),
  },
];
```

### 2b. `src/mcp/server.js`
```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { defaultDeps } from '../deps.js';
import { TOOLS } from './tools.js';
import { DiscordError } from '../lib/errors.js';

export function buildMcpServer(deps = defaultDeps) {
  const server = new McpServer({ name: 'discord-cli', version: '0.3.0' });
  for (const t of TOOLS) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, async (args) => {
      try {
        const result = await t.command(t.mapArgs(args || {}), deps);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof DiscordError ? err.message : (err && err.message) || String(err);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    });
  }
  return server;
}

export async function startMcpServer(deps = defaultDeps) {
  const server = buildMcpServer(deps);
  await server.connect(new StdioServerTransport());
}
```
(Reconcile `registerTool`/`McpServer` with the installed SDK — if the version uses `server.tool(name, schema, handler)` or a different content shape, adapt accordingly. The `tools.js` table stays unchanged.)

### 2c. `bin/discord-mcp.js`
```js
#!/usr/bin/env node
import { startMcpServer } from '../src/mcp/server.js';

startMcpServer().catch((err) => {
  process.stderr.write(String((err && err.stack) || err) + '\n');
  process.exit(1);
});
```
Make it executable: `chmod +x bin/discord-mcp.js` and verify `git ls-files -s` shows mode `100755` after add (commit the exec bit — the symlinked global install needs it).

### 2d. `package.json`
- `bin`: add `"discord-mcp": "./bin/discord-mcp.js"`.
- `dependencies`: add `@modelcontextprotocol/sdk` and `zod` (use whatever versions `npm install` resolves).

### 2e. Tests
- `test/mcp-tools.test.js`: assert `TOOLS` has the 8 expected names; for each tool, `mapArgs` produces the correct camelCase opts from snake_case args (pure, no mocking); `command` is the expected `run*` function (identity). Spot-check the mappings that rename (`reply_to→replyTo`, `auto_archive→autoArchive`, `no_audit→noAudit`, `log_body→logBody`, `allow_everyone→allowEveryone`).
- `test/mcp-server.test.js`: `buildMcpServer(fakeDeps)` constructs without throwing and returns an object; (if the SDK exposes a way to list registered tools, assert 8). Keep it light — the real validation is the manual smoke.

**Commit:** `feat: MCP server (stdio) delegating to the command layer`

---

## Task 3: Docs + verification

**Files:** `README.md` (MCP section), `~/.claude/CLAUDE.md` (Discord section MCP note — done by the orchestrator, not the subagent), `.ai/knowledge/architecture.md` (MCP layer); verification only otherwise.

- **README:** add an "MCP server" section: what it is, install (`npm install -g .` now also installs `discord-mcp`), registration (`claude mcp add discord -- discord-mcp`), the tool list, and that all safety (allowlist/mode/mention-safety/audit) applies because tools reuse the command layer. Note the server reads the same credentials/config/allowlist files. Bump version refs to 0.3.0.
- **architecture.md:** add the MCP layer (`bin/discord-mcp.js` → `src/mcp/server.js` → `src/mcp/tools.js` → command modules); note tools.js is SDK-agnostic + unit-tested, server.js is the SDK binding.
- **Verification:**
  - `npm run test:run` — full suite green (report count).
  - `node bin/discord-mcp.js` starts without crashing (it will wait on stdio; confirm it doesn't error on startup, then kill it). Alternatively, a scripted MCP `tools/list` handshake if practical.
  - `discord --version` → `0.3.0`; `discord read --thread <id>` help shows the flag.
  - Re-run the v0.2.0 acceptance smoke (doctor, channels, restricted block) to confirm no regressions.

**Commit:** `docs: v0.3.0 MCP server + thread-read; architecture note`

---

## Self-Review Notes
- The MCP server MUST reuse the command layer (no logic duplication) — that's what preserves the safety guarantees. tools.js is the testable seam; server.js is the thin SDK binding (reconcile with the installed SDK version).
- `bin/discord-mcp.js` needs the executable bit committed (same lesson as `bin/discord.js`).
- read/react `--thread` gates by PARENT (via `gateThreadParent`), matching `post --thread` — fail-closed.
