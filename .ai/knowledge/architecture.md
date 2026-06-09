# discord-cli Architecture

## Layer stack

```
bin/discord.js
  └─ src/cli.js            commander wiring + handle() wrapper
       └─ src/commands/*   one module per command, (opts, deps) → plain result object
            ├─ src/api/discord.js       REST client (built-in fetch, no SDK)
            ├─ src/allowlist.js         allowlist loader + channel resolver
            └─ src/auth/credentials.js  token resolution
```

**`bin/discord.js`** — entry point: calls `run(process.argv)`, nothing else.

**`src/cli.js`** — registers the Commander tree (`post`, `read`, `react`, `thread create`, `allow list`, `doctor`) and the global `--format json|table` / reserved `--profile` options. All actions go through `handle(fn, { table, preprocess }, deps)`, which:
- Runs an optional `preprocess` hook before the command (used by `post` to read piped stdin into `opts.message`).
- Calls the command function and prints via `printJson` or the `table` formatter.
- Catches any thrown error: if it is a `DiscordError`, sets `process.exitCode = err.exitCode`; otherwise uses `EXIT_CODES.GENERIC (1)`.

**`src/commands/*`** — each module exports a single async function `(opts, deps) → result object`. Commands are pure logic with no I/O beyond what is injected through `deps`. They throw typed `DiscordError` subclasses; they never call `process.exit` directly.

**`src/lib/errors.js`** — error taxonomy:
- `DiscordError` (base) — carries `exitCode`.
- `InvalidInputError` — exit 2 (CONFIG); bad flags, unknown aliases.
- `MissingCredentialsError` — exit 2; no token found.
- `ChannelNotAllowedError` — exit 3 (FORBIDDEN); allowlist block on writes.
- `DiscordApiError` — exit 1 (GENERIC); non-OK HTTP response from Discord.

**`src/lib/format.js`** — `printJson` (always available) + per-command `format*` table helpers (`formatPost`, `formatRead`, `formatReact`, `formatThread`, `formatAllowList`, `formatDoctor`). Selected by `handle()` when `--format table` is active.

## Dependency injection

**`src/deps.js`** exports `defaultDeps`:

```js
{
  resolveCredentials: () => resolveCredentials({}),
  createClient:       (creds) => createDiscordClient(creds),
  loadAllowlist:      () => loadAllowlist({}),
  now:                () => new Date().toISOString(),
}
```

Tests inject fakes for all four. No command imports `resolveCredentials`, `loadAllowlist`, or `createDiscordClient` directly — they always receive them through `deps`.

## Fail-closed allowlist invariant

`makeChannelResolver({ allowlist })` in `src/allowlist.js` produces three functions:

| Function | Used by | Behaviour |
|---|---|---|
| `resolveWrite(token)` | `post` (channel path), `thread create` | Returns `{ channelId }` only if alias is known or raw ID is in the allowlist; else `{ denied: token }`. |
| `resolveRead(token)` | `read`, `react` | Raw channel IDs always resolve. An alias resolves only if it is in the allowlist map. Unknown aliases return `{ denied }` — the command throws `InvalidInputError` (exit 2, not 3). |
| `isAllowedId(id)` | `post` (thread path) | Boolean allowlist membership test; gates posting into a thread by its `parent_id`. |

Summary: **writes are fail-closed** (unknown alias or unlisted raw ID → `ChannelNotAllowedError` exit 3). **Reads and reactions accept raw IDs freely** — an alias must be in the allowlist to resolve, but a raw numeric snowflake always goes through.

Missing allowlist file → `loadAllowlist` returns `{ channels: [] }` → empty `idSet` and `aliasMap` → every write is denied.

## Output

- JSON by default (`printJson` → `JSON.stringify` 2-space pretty).
- `--format table` → command-specific `format*` helper returns a plain string, printed with a trailing newline.
- Global `--format` is read from the root commander instance via `root.opts()` inside `handle()`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Discord API error, network failure, or unexpected exception |
| 2 | User-fixable config: missing token, bad flag, unresolvable alias |
| 3 | Blocked by allowlist (write to an unlisted channel) |

## Profile-ready seam

Both `resolveCredentials({ profile })` and `loadAllowlist({ profile })` accept a `profile` argument (forwarded from `--profile`). In v1 it is accepted but unused (`_profile`). This mirrors the `personal-agent` / `daedabyte-agent` pattern in the sibling CLIs and makes adding multi-bot profiles a non-breaking extension.

## REST client (`src/api/discord.js`)

- Discord API v10, base URL `https://discord.com/api/v10`.
- Built-in `fetch` (Node ≥ 20 required); no SDK dependency.
- `Authorization: Bot <token>` header on every request.
- 429 rate-limit retry: honors `Retry-After` header (seconds), retries up to `MAX_RETRIES = 2`.
- Non-OK responses throw `DiscordApiError` with the HTTP status and Discord error body.
- Methods: `getMe`, `getChannel`, `getMessages`, `createMessage`, `addReaction`, `startThreadFromMessage`.
- `fetchImpl` and `sleep` are injectable for tests.
