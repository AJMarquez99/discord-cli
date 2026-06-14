# discord-cli v0.2.0 — Discovery, Scoping & Guardrails — Design Spec

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan
**Builds on:** v0.1.0 (`.ai/plans/2026-06-09-discord-cli-design.md`)

## Overview

v0.2.0 evolves the security model from "allowlist gates *writes*; reads/reactions ungated" to
**"the allowlist gates all channel *content* access; channel *discovery* is a separate, broader
capability governed by Discord's own permissions."** It also **drops channel aliases** (the
`channels` discovery command supersedes them), adds a configurable restricted↔open mode
(strictly scoped to allowlisted servers), an audit log, default mention safety, and dry-run.

## Goals

1. **Discovery without content:** an agent can enumerate a server's channel **names/IDs** but
   cannot read message **contents** of channels it hasn't been allowlisted for.
2. **Content is allowlisted:** `post`, `read`, `react`, `reply`, `thread create` all require an
   allowlisted channel (read/react join writes — a behavior change from v0.1.0).
3. **Optional open mode:** the bot starts restricted (fail-closed) but can be toggled to write to
   any visible channel **within allowlisted servers**. No servers listed ⇒ open grants nothing.
4. **Guardrails for breadth:** audit log, default-on mention safety, and dry-run.

## Non-Goals

- Editing/deleting messages, DMs, member/role management (deferred — more surface + risk).
- Channel **aliases** (removed; use `discord channels` to map names↔IDs).

---

## 1. Config & Files

| File | Purpose | Override |
|---|---|---|
| `~/.config/discord-cli/credentials.json` | bot token (unchanged) | `DISCORD_CLI_CONFIG` |
| `~/.config/discord-cli/allowlist.json` | channel IDs **+ now `servers`** | `DISCORD_ALLOWLIST` |
| `~/.config/discord-cli/config.json` | **new** non-secret prefs (`mode`, `auditLog`) | `DISCORD_CLI_SETTINGS` |
| `~/.config/discord-cli/audit.jsonl` | **new** append-only action log | `DISCORD_AUDIT_LOG` |

**allowlist.json** — channels are now plain channel-ID strings, plus an optional `servers` list:
```json
{
  "channels": ["123456789012345678"],
  "servers": ["987654321098765432"]
}
```
- `channels`: array of channel-ID strings. An **object form** `{ "channelId": "…", "serverId": "…?" }`
  is also accepted (serverId is optional metadata, currently unused by the gate).
- **Backward compatibility:** the loader still reads the v0.1.0 alias-object form
  (`{ alias, channelId, serverId }`) — it extracts `channelId` and ignores `alias`. A bare
  top-level array is treated as `channels` with `servers: []`.
- Missing file ⇒ `{ channels: [], servers: [] }` (fail-closed).
- The live `~/.config/discord-cli/allowlist.json` will be migrated to the new shape as part of rollout.

**config.json** (all fields optional; CLI flags/env override):
```json
{ "mode": "restricted", "auditLog": { "enabled": true, "logBody": false } }
```
- `mode`: `"restricted"` (default) | `"open"`. Precedence: `--unrestricted` flag → `DISCORD_MODE`
  env → `config.json` → default `restricted`.
- `auditLog.enabled` (default `true`), `auditLog.logBody` (default `false`).

---

## 2. The content gate (mode-aware, ID-only)

A single async helper `gateChannel({ channelId, isThread, mode, allowlist, client })` resolves a
target to `{ channelId, allowlisted }` or throws. It **replaces** v0.1.0's
`resolveWrite`/`resolveRead` split and the alias map. Used by `post`, `read`, `react`,
`thread create`. `--channel` accepts a **channel ID only** (no alias resolution).

- **restricted mode:**
  - `channelId ∈ allowlist.channels` → ok (`allowlisted: true`).
  - else → `ChannelNotAllowedError` (exit 3).
- **open mode:**
  - `channelId ∈ allowlist.channels` → ok (`allowlisted: true`, no API call).
  - else → fetch `client.getChannel(channelId)`; require its `guild_id ∈ allowlist.servers`
    → ok (`allowlisted: false`); else `ChannelNotAllowedError` (exit 3).
  - If `allowlist.servers` is empty, the second branch can never pass → open grants no new
    targets (only already-allowlisted channels work).
- **Thread targets** (`post --thread`; `thread create` gates its parent `--channel`):
  - restricted: parent channel id must be in `allowlist.channels` (`isAllowedId`).
  - open: parent in `allowlist.channels` → ok; else fetch parent and require its
    `guild_id ∈ servers`. For `post --thread`, fetch the thread (`getChannel(threadId)`) to get
    `parent_id`, then apply the same parent rule.

`read` and `react` now go through this gate → a non-allowlisted channel is **blocked (exit 3)** in
restricted mode (and in open mode unless its server is allowlisted), exactly like a post. There is
no "unknown alias" case anymore — a non-allowlisted ID is simply blocked.

---

## 3. `discord channels` — discovery (metadata only)

`discord channels [--server <guildId>] [--type <text|voice|category|announcement|stage|forum>]`

- **Server resolution:** `--server` → else the single entry in `allowlist.servers` → else error
  ("specify --server; known servers: …").
- Calls `client.getGuildChannels(guildId)` (`GET /guilds/{id}/channels`). Returns
  `{ serverId, count, channels: [ { id, name, type, parentId, allowlisted } ] }`.
  - `type` mapped from Discord's numeric channel type (0→text, 2→voice, 4→category,
    5→announcement, 13→stage, 15→forum, others→`type:<n>`).
  - `allowlisted: true` if the channel id is in `allowlist.channels` (doubles as an
    allowlist-builder).
  - `--type` filters client-side.
- **Metadata only** — never fetches messages. **Ungated** (this is the discovery capability);
  visibility is whatever Discord returns for the bot's permissions (public by default; private
  channels only if an admin granted the bot a role with access).
- Table formatter groups by category and marks allowlisted channels (e.g. a `*`).

---

## 4. Audit log

On each **successful** `post` / `react` / `thread create`, append one JSONL line to
`~/.config/discord-cli/audit.jsonl`:
```json
{ "ts": "2026-…Z", "action": "post|react|thread", "channelId": "…", "messageId": "…",
  "threadId": "…?", "emoji": "…?", "mode": "restricted|open", "allowlisted": true, "body": "…?" }
```
- `body` included only if `auditLog.logBody` (config) or `--log-body` (flag).
- Controlled by `auditLog.enabled` (default true); `--no-audit` skips a single action.
- A failed audit write **warns to stderr but never fails the operation** (mirrors gmail-cli).
- **Viewer:** `discord audit [--limit N]` (default 20, newest first); JSON default / table.
- Dry-runs are **not** logged.

---

## 5. Mention safety (default-on, `post` only)

`post` sets `allowed_mentions` to suppress mass pings by default:
- Default payload: `allowed_mentions: { parse: ["users"] }` — user @mentions resolve, but
  **`@everyone`/`@here` and role mentions are stripped** (rendered as text, no ping).
- On a reply (`--reply-to`), also set `replied_user: true` so replying still pings the author.
- Opt-ins: `--allow-everyone` adds `"everyone"` to `parse` (covers @everyone/@here);
  `--allow-roles` adds `"roles"`. `react`/`thread` have no free-text content → unaffected.

---

## 6. Dry-run (`--dry-run` on writes: post / react / thread create)

Assemble the request and **run the gate** (so blocks are reported) but **do not call the write API
and do not write the audit log**. Returns a preview envelope, e.g. for post:
```json
{ "dryRun": true, "action": "post", "targetChannelId": "…|null", "blocked": false,
  "reason": null, "mode": "open", "allowlisted": false, "content": "…",
  "allowedMentions": { "parse": ["users"] }, "replyTo": null }
```
- If the gate would block, `blocked: true` + `reason`, `targetChannelId: null` — **reported, not
  thrown** (exit 0), so an agent can self-check. (A real run still throws → exit 3.)
- In open mode, dry-run may still call `getChannel`/thread lookups to evaluate the gate; those are
  reads, not writes, so they're fine.

---

## 7. `doctor` changes

Envelope gains `mode` and `servers`; the table output announces mode prominently:
- restricted: `mode: restricted (allowlisted channels only)`
- open + servers: `mode: OPEN — writes to any visible channel in N allowed server(s)`
- open + 0 servers: `mode: OPEN — no servers allowlisted, so only the N allowlisted channel(s) are writable`
Also reports `servers: N` and keeps `allowlist: N channel(s)`.

---

## 8. Internal changes summary

- `src/config.js` (**new**): `loadConfig({...})` → `{ mode, auditLog }` with precedence/env.
- `src/allowlist.js`: parse `{ channels, servers }` (ID strings; back-compat with alias/object
  forms); remove the alias map and `resolveWrite`/`resolveRead`; export `gateChannel` (async) and
  keep `isAllowedId`.
- `src/api/discord.js`: add `getGuildChannels(guildId)`.
- `src/lib/audit.js` (**new**): `appendAudit(entry)`, `readAudit({limit})`.
- `src/commands/`: `channels.js` (**new**), `audit.js` (**new**); update `post.js`, `read.js`,
  `react.js`, `thread.js` to use `gateChannel` + dry-run + audit (+ mentions in post).
- `src/deps.js`: wire `loadConfig`, `appendAudit`, `readAudit`, `now`.
- `src/cli.js`: register `channels`, `audit`; add `--unrestricted`, `--dry-run`, `--no-audit`,
  `--log-body`, `--allow-everyone`, `--allow-roles`, `--server`, `--type` flags as relevant; drop
  alias references in help.
- `src/lib/format.js`: `formatChannels`, `formatAudit`, dry-run formatting, doctor mode line; drop
  alias from `formatAllowList`/`read`.
- `src/commands/allow.js`: list channel IDs + servers (no alias).
- Bump version to `0.2.0`. Update README, CLAUDE.md Discord section, `.ai/knowledge/architecture.md`.

## 9. Exit codes (unchanged set)

`0` ok (incl. dry-run, even when it reports `blocked: true`) · `1` API/network · `2` config
(missing token, malformed config) · `3` blocked by allowlist/mode.

## 10. Testing

vitest, REST layer mocked. New/changed coverage: config precedence; allowlist `{channels,servers}`
parsing incl. back-compat with alias/object/bare-array forms; `gateChannel` in both modes
(allowlisted id, raw-id-in-allowlisted-server, raw-id-wrong-server, open-with-0-servers, restricted
non-allowlisted, thread-parent in each mode); `channels` server resolution + type mapping +
allowlisted marking + `--type` filter; audit append/read + `--no-audit` + logBody; mention defaults
+ `--allow-everyone`; dry-run for post/react/thread (no write, no audit, reports block); doctor mode
lines; read/react blocked when non-allowlisted (exit 3); end-to-end via `run()`.

## 11. Acceptance Criteria

1. `discord channels` lists name→id for the resolved server, marks allowlisted channels, shows no
   message content, and works for a server even if its channels aren't allowlisted.
2. In **restricted** mode, `read`/`react`/`post` on a non-allowlisted channel are **blocked
   (exit 3)**; allowlisted channels work.
3. In **open** mode with a server allowlisted, `post`/`read` to a non-allowlisted but visible
   channel in that server succeeds (one `getChannel` lookup); a channel in a non-allowlisted server
   is blocked; with 0 servers, only allowlisted channels work.
4. `doctor` announces the active mode and server count.
5. A `@everyone` in post content does **not** ping unless `--allow-everyone`; the audit log records
   the post; `--dry-run` previews without sending or logging.
6. vitest passes; exit codes per §9.
