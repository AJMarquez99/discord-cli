# discord-cli — Design Spec

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan
**Owner:** Alejandro Marquez (personal / `AJMarquez99`)

## Overview

A global ESM CLI named **`discord`** — a sibling to the existing `gmail`, `gsc`, and `gh`
agentic tools. Agents invoke it via Bash to **post**, **read history**, **react/reply**, and
**manage threads** in Discord. It is stateless and uses the **Discord REST API v10** only
(`Authorization: Bot <token>`); no gateway/websocket connection, because every supported
operation maps to a REST endpoint.

A thin **MCP wrapper** over this CLI is designed (see Phase 2) but **not built in the first
pass** — the CLI ships and is proven first, matching the gmail/gsc pattern.

## Goals

- Let agents post messages, read recent channel history, add reactions, reply to messages,
  and create threads — via simple Bash invocations.
- Fail-closed safety on anything that **writes a message**, mirroring gmail-cli's recipient
  allowlist.
- JSON-by-default output suitable for agent consumption, `--format table` for humans.
- One bot identity across many channels/servers, with credential/allowlist resolution
  structured so **named profiles** can be added later without rework.

## Non-Goals

- Server management (create channels, manage roles, kick/ban, edit server settings).
- Real-time event listening / gateway intents beyond what REST history reading needs.
- Multiple bot profiles in v1 (designed-for, not implemented — see Profiles below).
- Voice, slash-command registration, interaction/component handling.

## Identity & Channel Model

A single Discord **bot token** is not tied to one channel. Once the bot is invited to the
servers you care about, it can act in any channel where it has permission. "Various channels"
is therefore the default: the allowlist (for writes) and raw IDs/aliases (for reads) address
as many channels across as many servers as the bot can see.

**Profiles (designed, deferred):** v1 resolves a single default credential + allowlist. The
resolution layer (`auth/credentials.js`, `allowlist.js`) takes an optional `profile` argument
that defaults to the single configured identity today. Adding aws-style profiles later means:
keying config files by profile name (e.g. `~/.config/discord-cli/profiles/<name>/`), and
honoring `--profile` / `DISCORD_PROFILE`. No command-surface change required. This is a
documented extension point, not built now.

## Auth & Config

- **Credential — bot token.** Resolution precedence:
  1. `DISCORD_BOT_TOKEN` env var.
  2. `~/.config/discord-cli/credentials.json` → `{ "botToken": "..." }`.
  - Config path override: `DISCORD_CLI_CONFIG`.
- **Required Discord setup (documented in README):**
  - A Discord application + bot in the Developer Portal.
  - **Message Content privileged intent** enabled — without it, REST returns empty
    `content` for messages the bot did not author and is not mentioned in, which breaks
    `read`.
  - Bot invited to target servers with permissions: View Channel, Read Message History,
    Send Messages, Send Messages in Threads, Create Public Threads, Add Reactions.

## Safety Model

- **Fail-closed channel allowlist** at `~/.config/discord-cli/allowlist.json`
  (override `DISCORD_ALLOWLIST`). Entries:
  ```json
  [{ "alias": "general", "channelId": "123456789012345678", "serverId": "987..." }]
  ```
  `serverId` is optional metadata for readability.
- **Gates every message send** — `post`, replies (`post --reply-to`), thread messages, and
  `thread create`. The target is resolved to the channel the message lands in; for a **thread**,
  gating is evaluated against its **parent channel** (the CLI resolves the parent via the
  thread's channel object before allowing the write).
- **Reads and reactions are ungated** — allowed anywhere the bot can see, per design choice.
- **No allowlist file ⇒ nothing is postable** (fail-closed). Reads/reactions still work.
- Channel resolution: a `--channel` value is first matched against allowlist aliases, then
  treated as a raw snowflake ID. For **writes**, a raw ID must still be present in the
  allowlist or the command is rejected with exit code 3. For **reads/reactions**, any alias
  or raw ID is accepted.

## Command Surface

All commands accept `--format json` (default) | `table`, and a global `--profile` flag
(accepted but only the default identity is wired in v1).

- **`discord post`** — send a message. *Allowlist-gated.*
  - `--channel <alias|id>` (required), `--message "…"` (or body piped via stdin).
  - `--reply-to <messageId>` — send as a reply to that message.
  - `--thread <threadId>` — send into a thread (gated by parent channel).
- **`discord read`** — fetch recent messages. *Ungated.*
  - `--channel <alias|id>` (required), `--limit <N>` (default 25, Discord max 100),
    `--before <messageId>`, `--after <messageId>`.
  - Output: array of `{ id, author, content, timestamp, reactions, ... }`.
- **`discord react`** — add a reaction. *Ungated.*
  - `--channel <alias|id>`, `--message <messageId>`, `--emoji <unicode|name:id>` (required).
- **`discord thread create`** — start a thread from a message. *Gated.*
  - `--channel <alias|id>`, `--from <messageId>`, `--name "…"` (required).
  - Optional `--auto-archive <minutes>` (60 | 1440 | 4320 | 10080).
- **`discord allow list`** — print allowlist entries (editing is done by hand in the file,
  like gmail-cli). Reports count and aliases.
- **`discord doctor`** — verify the credential via `GET /users/@me`; print bot identity
  (username, id), allowlist entry count, config source, and live API reachability.

## Output & Error Handling

- **JSON by default**; `--format table` renders a concise human summary.
- **Exit codes** (mirroring gmail-cli):
  - `0` — success.
  - `1` — Discord API / network failure.
  - `2` — user-fixable config (missing token, malformed allowlist, missing required flag).
  - `3` — target blocked by allowlist.
- Errors print a structured JSON error object (`{ "error": { "code", "message" } }`) on
  stderr in JSON mode, or a readable line in table mode.

## Rate Limiting

The REST client respects Discord's `429` responses and the `Retry-After` header with a
bounded retry (default 2 retries, capped backoff). Global vs per-route buckets are handled by
honoring the header value; no proactive bucket tracking in v1 (YAGNI — CLI invocations are
low-volume).

## Internal Structure

Mirrors gmail-cli's layout.

```
bin/discord.js                 thin entrypoint → src/cli.js
src/cli.js                     commander wiring, global flags
src/auth/credentials.js        token resolution (profile-aware signature)
src/api/discord.js             REST client: fetch + Bot auth + 429 retry + endpoints
src/allowlist.js               load, resolve alias/id, fail-closed write gate, thread→parent
src/commands/post.js
src/commands/read.js
src/commands/react.js
src/commands/thread.js
src/commands/allow.js
src/commands/doctor.js
src/lib/errors.js              typed errors → exit codes
src/lib/format.js              json | table rendering
test/…                         vitest, REST layer mocked
package.json                   bin: { "discord": "./bin/discord.js" }, type: module, node>=20
README.md                      setup (bot creation, intent, invite), command reference
.ai/                           project intelligence (knowledge/guidelines/plans/…)
```

Dependencies: `commander` (CLI). REST calls use built-in `fetch` (Node ≥20) — no SDK
dependency, keeping it light like the other tools. `devDependencies`: `vitest`.

## Testing (vitest, REST layer mocked)

- Token resolution precedence (env over file; missing → exit 2).
- Allowlist: alias resolution, raw-ID-in-allowlist accepted for writes, raw-ID-not-in-allowlist
  rejected (exit 3), no-file fail-closed, reads/reactions ungated.
- Thread write gating resolves to parent channel before allowing.
- Each command shapes the correct REST request (method, path, body).
- `read` maps `--limit`/`--before`/`--after` to query params; caps limit at 100.
- 429 → retry honoring `Retry-After`; exhausted retries → exit 1.
- Output: JSON default vs `--format table`; structured error objects on failure.
- `doctor` happy path (`GET /users/@me`) and bad-token path.

## Phase 2 — MCP Wrapper (deferred, designed)

A thin MCP server that exposes the same operations as structured tools (`discord_post`,
`discord_read`, `discord_react`, `discord_thread_create`), each delegating to the CLI's
command modules (not shelling out) so logic and the allowlist gate are shared. Built only
after the CLI is proven. No work in v1 beyond keeping command modules importable as functions.

## Acceptance Criteria

1. `discord doctor` confirms the bot identity against a real token.
2. `discord post --channel <allowlisted alias> --message "…"` posts; an un-allowlisted target
   fails with exit code 3 and posts nothing.
3. `discord read --channel <alias> --limit 5` returns the 5 most recent messages with content
   (given the Message Content intent is enabled).
4. `discord react` adds a reaction; `discord thread create` starts a named thread from a
   message and is gated by the parent channel.
5. All commands emit valid JSON by default and a readable `--format table` summary.
6. vitest suite passes with the REST layer mocked; exit codes match the table above.
