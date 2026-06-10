# discord-cli

A personal Discord CLI for agentic sessions — the `gh`/`gmail`/`gsc` sibling. Post messages,
read channel history, react, reply, and create threads via the Discord REST API. All channel
content access (reads, reactions, writes) is gated by a fail-closed allowlist.

**Version:** 0.2.0

## Install

```bash
cd ~/Code/Projects/discord-cli && npm install && npm install -g .
```

## Discord setup

1. Create an application + bot at https://discord.com/developers/applications.
2. **Enable the Message Content privileged intent** (Bot → Privileged Gateway Intents) — required to read message content via `discord read`. Without it, the Discord API returns empty `content` for messages the bot didn't author and isn't mentioned in.
3. Invite the bot (OAuth2 → URL Generator, scope `bot`) with these permissions: View Channel, Read Message History, Send Messages, Send Messages in Threads, Create Public Threads, Add Reactions.
4. Enable Developer Mode in Discord (Settings → Advanced) to copy channel/server IDs (right-click → Copy ID).

## Credentials

Set `DISCORD_BOT_TOKEN`, or create `~/.config/discord-cli/credentials.json`:

```json
{ "botToken": "your-bot-token" }
```

Override the config path with `DISCORD_CLI_CONFIG`. Token precedence: env var first, then file.

## Allowlist

`~/.config/discord-cli/allowlist.json` (override with `DISCORD_ALLOWLIST`):

```json
{
  "channels": ["1514035571826102413"],
  "servers": ["1362426046091362305"]
}
```

- `channels`: array of channel-ID strings. All content access (`post`, `read`, `react`, `reply`, `thread create`) requires an allowlisted channel. A thread is gated by its **parent** channel.
- `servers`: array of guild-ID strings. Used by open mode (see below) to permit writes to any visible channel in an allowlisted server.
- **No allowlist file → nothing is accessible** (fail-closed). Missing file returns `{ channels: [], servers: [] }`.
- **`--channel` accepts a channel ID only** — aliases have been removed. Use `discord channels` to look up name→ID mappings.
- **Backward compatible:** the loader still accepts the v0.1.0 alias-object form (`{ alias, channelId, serverId }`) — it extracts `channelId` and ignores `alias`. A bare top-level array is treated as `channels` with `servers: []`.

## Config

`~/.config/discord-cli/config.json` (override with `DISCORD_CLI_SETTINGS`):

```json
{ "mode": "restricted", "auditLog": { "enabled": true, "logBody": false } }
```

All fields are optional. Defaults: `mode: "restricted"`, `auditLog.enabled: true`, `auditLog.logBody: false`.

## Mode (restricted vs open)

**restricted** (default, fail-closed): content access is limited to channels explicitly listed in `allowlist.channels`. Any other channel ID is blocked with exit 3.

**open**: content access extends to any channel visible to the bot, as long as the channel belongs to a server in `allowlist.servers`. Channels already in `allowlist.channels` are always permitted without an extra API lookup. Channels not in `allowlist.channels` incur one `GET /channels/{id}` call to verify the server membership. **If `servers` is empty, open mode grants nothing beyond already-allowlisted channels.**

Mode precedence (highest to lowest):
1. `--unrestricted` flag (per-command)
2. `DISCORD_MODE=open` environment variable
3. `mode` in `config.json`
4. Default: `restricted`

## Audit log

Every successful `post`, `react`, and `thread create` appends a JSONL line to `~/.config/discord-cli/audit.jsonl` (override with `DISCORD_AUDIT_LOG`):

```json
{ "ts": "2026-…Z", "action": "post|react|thread", "channelId": "…", "messageId": "…",
  "mode": "restricted|open", "allowlisted": true }
```

- The message body is **excluded** unless `auditLog.logBody: true` in `config.json` or `--log-body` is passed.
- Auditing is controlled by `auditLog.enabled` (default `true`); pass `--no-audit` to skip a single action.
- A failed audit write warns to stderr but never fails the operation.
- Dry-runs are **not** logged.
- View recent entries with `discord audit [--limit N]`.

## Commands

All commands print JSON by default; add `--format table` for a human summary.
Global flags: `--format json|table` (default `json`), `--profile <name>` (reserved; single identity in v1).

### `discord post`

```
discord post --channel <id> --message "..."
```

Post a message to an allowlisted channel. Options:

- `--channel <id>` — target channel ID
- `--message <text>` — message content (or pipe on stdin)
- `--reply-to <messageId>` — reply to this message (pings the author)
- `--thread <threadId>` — post into an existing thread (gated by its parent channel); takes precedence over `--channel`
- `--unrestricted` — open mode: allow any visible channel in an allowlisted server
- `--dry-run` — preview without sending or logging (exit 0 even if it would be blocked)
- `--no-audit` — skip writing this action to the audit log
- `--log-body` — include the message body in the audit entry
- `--allow-everyone` — permit `@everyone`/`@here` pings (suppressed by default)
- `--allow-roles` — permit role pings (suppressed by default)

**Mention safety (default-on):** `@everyone`, `@here`, and role pings are stripped by default. Only user `@mentions` resolve. Pass `--allow-everyone` or `--allow-roles` to opt back in. Replying with `--reply-to` always pings the replied-to author.

The message body can be piped on stdin when `--message` is omitted.

**Examples:**

```bash
discord post --channel 1514035571826102413 --message "Deploy complete."
echo "Nightly report ready." | discord post --channel 1514035571826102413
discord post --channel 1514035571826102413 --message "test" --dry-run
```

### `discord read`

```
discord read --channel <id> [--limit N] [--before <messageId>] [--after <messageId>]
```

Fetch recent messages from an allowlisted channel (blocked in restricted mode if channel is not allowlisted). Options:

- `--channel <id>` — channel ID (must be allowlisted in restricted mode)
- `--limit <n>` — max messages to return (1–100, default 25)
- `--before <messageId>` — only messages before this ID
- `--after <messageId>` — only messages after this ID
- `--unrestricted` — open mode: any visible channel in an allowlisted server

### `discord react`

```
discord react --channel <id> --message <messageId> --emoji 👍
```

Add a reaction to a message (allowlist-gated). Options:

- `--channel <id>` — channel ID (must be allowlisted in restricted mode)
- `--message <messageId>` — target message ID
- `--emoji <emoji>` — unicode emoji, or custom emoji as `name:id`
- `--unrestricted` — open mode: any visible channel in an allowlisted server
- `--dry-run` — preview without reacting or logging
- `--no-audit` — skip writing this action to the audit log

### `discord thread create`

```
discord thread create --channel <id> --from <messageId> --name "..."
```

Start a thread from an existing message (allowlist-gated by parent channel). Options:

- `--channel <id>` — parent channel ID
- `--from <messageId>` — message to start the thread from
- `--name <name>` — thread name
- `--auto-archive <minutes>` — auto-archive duration: `60` | `1440` | `4320` | `10080`
- `--unrestricted` — open mode: any visible channel in an allowlisted server
- `--dry-run` — preview without creating or logging
- `--no-audit` — skip writing this action to the audit log

### `discord channels`

```
discord channels [--server <guildId>] [--type <type>]
```

List a server's channels (name→ID, type, category). Marks allowlisted channels with `*`. Metadata only — never fetches message content. Ungated; visibility follows the bot's Discord permissions.

- `--server <guildId>` — guild/server ID. Defaults to the single entry in `allowlist.servers`; required if `servers` contains 0 or 2+ entries.
- `--type <type>` — filter by channel type: `text` | `voice` | `category` | `announcement` | `stage` | `forum`

**Example:**

```bash
discord channels --server 1362426046091362305
discord channels --server 1362426046091362305 --type text
```

### `discord allow list`

```
discord allow list
```

Show allowlisted channel IDs and server IDs. Edit `~/.config/discord-cli/allowlist.json` by hand to add or remove entries.

### `discord audit`

```
discord audit [--limit N]
```

Show recent audited actions, newest first.

- `--limit <n>` — max entries to show (default 20)

### `discord doctor`

```
discord doctor
```

Verify the bot token; report active mode, bot identity (username, ID, credential source), allowlist channel count, and server count.

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (including dry-run, even when it reports `blocked: true`) |
| `1` | Discord API error, network failure, or unexpected exception |
| `2` | User-fixable config: missing token, malformed config file, bad flags |
| `3` | Blocked by allowlist or mode (non-allowlisted channel in restricted mode, or channel not in an allowlisted server in open mode) |

## Phase 2 — MCP wrapper (planned)

A thin MCP server will expose these same operations as structured tools, delegating to the
command modules so the allowlist gate is shared. Not built yet.
