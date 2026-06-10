# discord-cli Architecture

## Layer stack

```
bin/discord.js
  └─ src/cli.js              commander wiring + handle() wrapper
       └─ src/commands/*     one module per command, (opts, deps) → plain result object
            ├─ src/api/discord.js       REST client (built-in fetch, no SDK)
            ├─ src/allowlist.js         allowlist loader + content gate
            ├─ src/config.js            mode + audit prefs loader
            ├─ src/lib/audit.js         audit log (append/read/recordAction)
            ├─ src/lib/mentions.js      allowed_mentions builder
            └─ src/auth/credentials.js  token resolution
```

**`bin/discord.js`** — entry point: calls `run(process.argv)`, nothing else.

**`src/cli.js`** — registers the Commander tree (`post`, `read`, `react`, `thread create`, `channels`, `allow list`, `audit`, `doctor`) and the global `--format json|table` / reserved `--profile` options. All actions go through `handle(fn, { table, preprocess }, deps)`, which:
- Runs an optional `preprocess` hook before the command (used by `post` to read piped stdin into `opts.message`).
- Calls the command function and prints via `printJson` or the `table` formatter.
- Catches any thrown error: if it is a `DiscordError`, sets `process.exitCode = err.exitCode`; otherwise uses `EXIT_CODES.GENERIC (1)`.

**`src/commands/*`** — each module exports a single async function `(opts, deps) → result object`. Commands are pure logic with no I/O beyond what is injected through `deps`. They throw typed `DiscordError` subclasses; they never call `process.exit` directly.

**`src/lib/errors.js`** — error taxonomy:
- `DiscordError` (base) — carries `exitCode`.
- `InvalidInputError` — exit 2 (CONFIG); bad flags.
- `MissingCredentialsError` — exit 2; no token found.
- `MalformedConfigError` — exit 2; unparseable JSON in config/allowlist files.
- `ChannelNotAllowedError` — exit 3 (FORBIDDEN); allowlist block on any content access.
- `DiscordApiError` — exit 1 (GENERIC); non-OK HTTP response from Discord.

**`src/lib/format.js`** — `printJson` (always available) + per-command `format*` table helpers (`formatPost`, `formatRead`, `formatReact`, `formatThread`, `formatAllowList`, `formatDoctor`, `formatChannels`, `formatAudit`). Selected by `handle()` when `--format table` is active.

## Dependency injection

**`src/deps.js`** exports `defaultDeps`:

```js
{
  resolveCredentials: () => resolveCredentials({}),
  createClient:       (creds) => createDiscordClient(creds),
  loadAllowlist:      () => loadAllowlist({}),
  loadConfig:         () => loadConfig({}),
  appendAudit:        (entry) => appendAudit(entry, {}),
  readAudit:          (opts) => readAudit(opts || {}),
  now:                () => new Date().toISOString(),
}
```

Tests inject fakes for all of these. No command imports credentials, allowlist, config, or audit functions directly — they always receive them through `deps`.

## Content gate (v0.2.0)

**`src/allowlist.js`** exports the gate as two async helpers:

### `gateChannel({ channelId, mode, allowlist, client })`
Used by `post` (channel path), `read`, and `react`. Returns `{ channelId, allowlisted }` or throws `ChannelNotAllowedError` (exit 3).

| Condition | restricted | open |
|---|---|---|
| ID in `allowlist.channels` | allowed (`allowlisted: true`) | allowed (`allowlisted: true`, no API call) |
| ID not in channels, guild in `allowlist.servers` | blocked | allowed (one `getChannel` call; `allowlisted: false`) |
| ID not in channels, guild not in servers | blocked | blocked |
| servers list empty | blocked | blocked (open grants nothing new) |

### `gateThreadParent({ threadId, mode, allowlist, client })`
Used by `post --thread` and `thread create`. Fetches the thread to get its `parent_id`, then applies the same server/channel rules to the parent. Returns `{ channelId: threadId, allowlisted, parentId }` or throws.

**Channel aliases have been removed.** `--channel` accepts a channel ID only. Use `discord channels` to map names→IDs.

`isAllowedId` is an alias for `isAllowedChannel` (back-compat, used in thread gating).

## Discovery vs content

- **Discovery (`discord channels`):** calls `GET /guilds/{id}/channels`, returns metadata only (name, ID, type, category, `allowlisted` flag). **Ungated** — no allowlist check. Visibility follows Discord's own permissions for the bot.
- **Content (`post`, `read`, `react`, `thread create`):** gated by `gateChannel`/`gateThreadParent`. Non-allowlisted channel in restricted mode → exit 3.

## Config (`src/config.js`)

`loadConfig()` reads `~/.config/discord-cli/config.json` (override `DISCORD_CLI_SETTINGS`):

```json
{ "mode": "restricted", "auditLog": { "enabled": true, "logBody": false } }
```

Missing/empty file → defaults. Unknown `mode` values coerce to `"restricted"`.

`resolveMode({ config, env, unrestricted })` applies the precedence chain:
1. `--unrestricted` flag → `"open"`
2. `DISCORD_MODE` env var
3. `config.mode`
4. Default `"restricted"`

## Audit log (`src/lib/audit.js`)

- `appendAudit(entry)` — appends a JSONL line to `~/.config/discord-cli/audit.jsonl` (override `DISCORD_AUDIT_LOG`).
- `readAudit({ limit })` — reads, parses, reverses, and slices the JSONL file. Returns `{ entries: [...] }`.
- `recordAction({ append, now, config, opts, entry })` — called by `post`, `react`, `thread create` after a successful write. Honors `config.auditLog.enabled`, `opts.noAudit` / `opts.audit === false`, and `logBody`. A write failure warns to stderr but never fails the operation. Dry-runs skip `recordAction` entirely.

Audit entry shape:
```json
{ "ts": "ISO8601Z", "action": "post|react|thread", "channelId": "…",
  "messageId": "…", "mode": "restricted|open", "allowlisted": true }
```
`body` is included only when `logBody` is enabled.

## Mention safety (`src/lib/mentions.js`)

`buildAllowedMentions({ allowEveryone, allowRoles, isReply })` — constructs a Discord `allowed_mentions` object. Default: `{ parse: ["users"] }`, suppressing `@everyone`/`@here` and role pings. `--allow-everyone` adds `"everyone"` to `parse`; `--allow-roles` adds `"roles"`. `--reply-to` sets `replied_user: true` so the author is still pinged. Only `post` uses this; `react` and `thread create` have no free-text content.

## Dry-run pattern

`post`, `react`, and `thread create` support `--dry-run`. The gate runs in full (including any `getChannel` API calls needed for open mode). If the gate would block, `blocked: true` is **returned** (not thrown) and exit 0. No write API is called; `recordAction` is skipped. This lets an agent pre-check without side effects.

## REST client (`src/api/discord.js`)

- Discord API v10, base URL `https://discord.com/api/v10`.
- Built-in `fetch` (Node ≥ 20 required); no SDK dependency.
- `Authorization: Bot <token>` header on every request.
- 429 rate-limit retry: honors `Retry-After` header (seconds), retries up to `MAX_RETRIES = 2`.
- Non-OK responses throw `DiscordApiError` with the HTTP status and Discord error body.
- Methods: `getMe`, `getChannel`, `getGuildChannels`, `getMessages`, `createMessage`, `addReaction`, `startThreadFromMessage`.
- `fetchImpl` and `sleep` are injectable for tests.

## Output

- JSON by default (`printJson` → `JSON.stringify` 2-space pretty).
- `--format table` → command-specific `format*` helper returns a plain string, printed with a trailing newline.
- Global `--format` is read from the root commander instance via `root.opts()` inside `handle()`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (including dry-run, even when `blocked: true`) |
| 1 | Discord API error, network failure, or unexpected exception |
| 2 | User-fixable config: missing token, malformed config/allowlist file, bad flags |
| 3 | Blocked by allowlist or mode |

## MCP layer (v0.3.0)

A second front-end over the same command modules, exposed as a stdio Model Context Protocol
server. The layer stack is:

```
bin/discord-mcp.js
  └─ src/mcp/server.js    buildMcpServer / makeToolHandler / startMcpServer  (SDK binding)
       └─ src/mcp/tools.js   TOOLS table (SDK-agnostic)
            └─ src/commands/*   same run*(opts, deps) modules as the CLI
```

**`bin/discord-mcp.js`** — entry point: calls `startMcpServer()`, writes any startup error
to stderr, and exits 1.

**`src/mcp/server.js`** — SDK binding using `@modelcontextprotocol/sdk` v1:
- `buildMcpServer(deps)` — constructs a `McpServer` named `discord-cli` v`0.3.0`, registers
  every tool from `TOOLS` via `server.registerTool(name, schema, handler)`.
- `makeToolHandler(tool, deps)` — returns an async handler that calls
  `tool.command(tool.mapArgs(args), deps)` and wraps the result in
  `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. On any thrown error
  (including `DiscordError` subclasses), it returns
  `{ content: [{ type: 'text', text: msg }], isError: true }` — the server never crashes
  on a blocked or failed request.
- `startMcpServer(deps)` — connects the server to a `StdioServerTransport`.

**`src/mcp/tools.js`** — SDK-agnostic `TOOLS` array. Each entry is a plain object with:
- `name` — tool name string (e.g. `discord_post`)
- `description` — one-line description surfaced to the MCP client
- `inputSchema` — zod raw shape (passed directly to `registerTool`)
- `command` — the `run*` function to call (imported from `src/commands/*`)
- `mapArgs` — pure function mapping snake_case MCP args to camelCase opts (e.g.
  `reply_to → replyTo`, `auto_archive → autoArchive`, `no_audit → noAudit`)

The `TOOLS` table is unit-tested: each `mapArgs` is exercised with known inputs; each
`command` is checked for identity against the expected `run*` import. `makeToolHandler`'s
error path (`DiscordError → isError: true`) is also covered in tests.

**Safety inheritance:** tools pass opts to the same gated command functions used by the
CLI, with `defaultDeps`. The allowlist, restricted/open mode, mention-safety, dry-run, and
audit log all apply identically. A `ChannelNotAllowedError` from the command layer is caught
by `makeToolHandler` and returned as `isError: true` — not re-thrown.

**`read --thread` and `react --thread` (v0.3.0):** `runRead` and `runReact` now accept
either `--channel <id>` or `--thread <threadId>`. When `--thread` is given, they call
`gateThreadParent` (fetches the thread to get its `parent_id`, then applies the same
channel/server rules to the parent). This is symmetric with the existing `post --thread`
behavior and is reflected in both the CLI flags and the MCP tool schemas
(`discord_read`/`discord_react` both accept an optional `thread` field).

## Profile-ready seam

Both `resolveCredentials({ profile })` and `loadAllowlist({ profile })` accept a `profile` argument (forwarded from `--profile`). In v1 it is accepted but unused (`_profile`). This mirrors the `personal-agent` / `daedabyte-agent` pattern in the sibling CLIs and makes adding multi-bot profiles a non-breaking extension.
