# discord-cli v0.2.0 — Discovery, Scoping & Guardrails — Design Spec

**Date:** 2026-06-09
**Status:** Proposed design, pending user review
**Builds on:** v0.1.0 (`.ai/plans/2026-06-09-discord-cli-design.md`)

## Overview

v0.2.0 evolves the security model from "allowlist gates *writes*; reads/reactions ungated" to
**"the allowlist gates all channel *content* access; channel *discovery* is a separate,
broader capability governed by Discord's own permissions."** It adds a configurable
restricted↔open mode (server-scoped), an audit log, default mention safety, and dry-run.

## Goals

1. **Discovery without content:** an agent can enumerate a server's channel **names/IDs** but
   cannot read message **contents** of channels it hasn't been allowlisted for.
2. **Content is allowlisted:** `post`, `read`, `react`, `reply`, `thread create` all require an
   allowlisted channel (read/react join writes — a behavior change from v0.1.0).
3. **Optional open mode:** the bot starts restricted (fail-closed) but can be toggled to write
   to any channel it can see, scoped to allowlisted **servers**.
4. **Guardrails for breadth:** audit log, default-on mention safety, and dry-run.

## Non-Goals

- Editing/deleting messages, DMs, member/role management (deferred — more surface + risk).
- Reading/auditing other servers' content beyond what Discord permissions already allow.

---

## 1. Config & Files

| File | Purpose | Override |
|---|---|---|
| `~/.config/discord-cli/credentials.json` | bot token (unchanged) | `DISCORD_CLI_CONFIG` |
| `~/.config/discord-cli/allowlist.json` | channels **+ now optional `servers`** | `DISCORD_ALLOWLIST` |
| `~/.config/discord-cli/config.json` | **new** non-secret prefs (`mode`, `auditLog`) | `DISCORD_CLI_SETTINGS` |
| `~/.config/discord-cli/audit.jsonl` | **new** append-only action log | `DISCORD_AUDIT_LOG` |

**allowlist.json** gains an optional top-level `servers`:
```json
{
  "channels": [ { "alias": "test-ai", "channelId": "1514…", "serverId": "1362…" } ],
  "servers": [ "987654321098765432" ]
}
```
Bare-array form (`[ {…} ]`) still accepted → `{ channels: [...], servers: [] }`.

**config.json** (all fields optional; CLI flags/env override):
```json
{ "mode": "restricted", "auditLog": { "enabled": true, "logBody": false } }
```
- `mode`: `"restricted"` (default) | `"open"`. Precedence: `--unrestricted` flag → `DISCORD_MODE` env → `config.json` → default `restricted`.
- `auditLog.enabled` (default `true`), `auditLog.logBody` (default `false`).

---

## 2. The content gate (mode-aware)

A single async helper `gateChannel({ target, isThread, deps, mode, allowlist, client })` resolves a
target to a concrete `{ channelId, allowlisted }` or throws. It **replaces** v0.1.0's
`resolveWrite`/`resolveRead` split. Used by `post`, `read`, `react`, `thread create`.

- **restricted mode:**
  - alias → its `channelId` (allowlisted). Raw snowflake in `channels` → ok (allowlisted). Else → `ChannelNotAllowedError` (exit 3). (For an unknown *alias*, same as today: it can't resolve to an id → error.)
- **open mode:**
  - In `channels` allowlist → ok (`allowlisted: true`).
  - Raw snowflake not in allowlist → fetch `client.getChannel(id)`; let `g = guild_id`. If `servers` is non-empty, require `g ∈ servers` else `ChannelNotAllowedError`. If `servers` is empty/absent, allow (truly open) — **but `doctor` warns loudly** (see §6). Mark `allowlisted: false`.
  - Unknown alias (not a snowflake, not in `channels`) → `InvalidInputError` (exit 2): in open mode address non-allowlisted channels by raw id (aliases only exist for allowlisted channels). Suggest `discord channels` to find the id.
- **Thread targets** (`post --thread`, and `thread create` parent): gate by the **parent** channel.
  - restricted: parent must be in `channels` (via `isAllowedId`).
  - open: parent's `guild_id` must be in `servers` (or servers empty → allow). For `post --thread`, fetch the thread to get `parent_id`, then resolve the parent's guild (parent is itself a channel; if parent in allowlist we know its server, else fetch).

`read` and `react` now go through this gate → a non-allowlisted channel is **blocked (exit 3)** in
restricted mode, exactly like a post.

---

## 3. `discord channels` — discovery (metadata only)

`discord channels [--server <guildId>] [--type <text|voice|category|announcement|stage|forum>]`

- **Server resolution:** `--server` → else the single entry in allowlist `servers` → else the
  single distinct `serverId` across allowlist `channels` → else error "specify --server".
- Calls `client.getGuildChannels(guildId)` (`GET /guilds/{id}/channels`). Returns
  `{ serverId, count, channels: [ { id, name, type, parentId, allowlisted } ] }`.
  - `type` mapped from Discord's numeric channel type (0→text, 2→voice, 4→category,
    5→announcement, 13→stage, 15→forum, others→`type:<n>`).
  - `allowlisted: true` if the channel id is in the `channels` allowlist (doubles as an
    allowlist-builder).
  - `--type` filters client-side.
- **Metadata only** — never fetches messages. **Ungated** (this is the discovery capability);
  what's visible is whatever Discord returns for the bot's permissions (public by default;
  private channels only if an admin granted the bot a role with access).
- Table formatter groups by category, marks allowlisted channels (e.g. a `*`).

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
- **Viewer:** `discord audit [--limit N]` (default 20, newest first), JSON default / table.
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

Assemble the request and **run the gate** (so blocks are reported) but **do not call the write
API and do not write the audit log**. Returns a preview envelope, e.g. for post:
```json
{ "dryRun": true, "action": "post", "targetChannelId": "…|null", "blocked": false,
  "reason": null, "mode": "open", "allowlisted": false, "content": "…",
  "allowedMentions": { "parse": ["users"] }, "replyTo": null }
```
- If the gate would block, `blocked: true` + `reason`, and `targetChannelId: null` — **reported,
  not thrown** (exit 0), so an agent can self-check. (A real run still throws/exit-3.)
- Note: in open mode, dry-run may still need `getChannel`/thread lookups to evaluate the gate;
  those are reads, not writes, so they're fine.

---

## 7. `doctor` changes

Envelope gains `mode` and a server summary; the table output announces mode prominently:
- restricted: `mode: restricted (allowlisted channels only)`
- open + servers: `mode: OPEN — writes to any visible channel in N allowed server(s)`
- open + no servers: `mode: OPEN — ⚠ writes to ANY visible channel (no server scope set)`
Also reports `servers: N` and keeps `allowlist: N channel(s)`.

---

## 8. Internal changes summary

- `src/config.js` (**new**): `loadConfig({...})` → `{ mode, auditLog }` with precedence/env.
- `src/allowlist.js`: parse `servers`; replace `resolveWrite`/`resolveRead` with the async
  `gateChannel` helper (+ keep `isAllowedId`). Server membership helper.
- `src/api/discord.js`: add `getGuildChannels(guildId)`.
- `src/lib/audit.js` (**new**): `appendAudit(entry)`, `readAudit({limit})`.
- `src/lib/mentions.js` (**new**) or inline in post: build `allowed_mentions`.
- `src/commands/`: `channels.js` (**new**), `audit.js` (**new**); update `post.js`, `read.js`,
  `react.js`, `thread.js` to use `gateChannel` + dry-run + audit (+ mentions in post).
- `src/deps.js`: wire `loadConfig`, `appendAudit`, `readAudit`, `now`.
- `src/cli.js`: register `channels`, `audit`; add `--unrestricted`, `--dry-run`, `--no-audit`,
  `--log-body`, `--allow-everyone`, `--allow-roles` flags as relevant.
- `src/lib/format.js`: `formatChannels`, `formatAudit`, dry-run formatting, doctor mode line.
- Bump version to `0.2.0`. Update README, CLAUDE.md Discord section, `.ai/knowledge/architecture.md`.

## 9. Exit codes (unchanged set)

`0` ok (incl. dry-run, even when it reports `blocked: true`) · `1` API/network · `2` config
(missing token, unknown alias, malformed config) · `3` blocked by allowlist/mode.

## 10. Testing

vitest, REST layer mocked. New/changed coverage: config precedence; allowlist `servers`
parsing; `gateChannel` in both modes (allowlisted, raw-id-in-server, raw-id-wrong-server,
open-no-servers, unknown alias, thread-parent in each mode); `channels` server resolution + type
mapping + allowlisted marking + `--type` filter; audit append/read + `--no-audit` + logBody;
mention defaults + `--allow-everyone`; dry-run for post/react/thread (no write, no audit, reports
block); doctor mode lines; read/react now blocked when non-allowlisted (exit 3); end-to-end via
`run()`.

## 11. Acceptance Criteria

1. `discord channels` lists name→id for the resolved server, marks allowlisted channels, shows no
   message content, and works for a server not in the channel allowlist.
2. In **restricted** mode, `read`/`react` on a non-allowlisted channel are **blocked (exit 3)**;
   allowlisted channels work.
3. In **open** mode with a server allowlisted, `post` to a non-allowlisted but visible channel in
   that server succeeds; a channel in a non-allowlisted server is blocked.
4. `doctor` announces the active mode (and warns when open with no server scope).
5. A `@everyone` in post content does **not** ping unless `--allow-everyone`; the audit log
   records the post; `--dry-run` previews without sending or logging.
6. vitest passes; exit codes per §9.
