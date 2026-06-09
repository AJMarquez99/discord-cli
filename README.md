# discord-cli

A personal Discord CLI for agentic sessions — the `gh`/`gmail`/`gsc` sibling. Post messages,
read channel history, react, reply, and create threads via the Discord REST API. All message
sends are gated by a fail-closed channel allowlist.

## Install

```bash
cd ~/Code/Projects/discord-cli && npm install && npm install -g .
```

## Discord setup

1. Create an application + bot at https://discord.com/developers/applications.
2. **Enable the Message Content privileged intent** (Bot → Privileged Gateway Intents) — required to read message content via `discord read`. Without it, the Discord API returns empty `content` for messages the bot didn't author and isn't mentioned in.
3. Invite the bot (OAuth2 → URL Generator, scope `bot`) with these permissions: View Channel, Read Message History, Send Messages, Send Messages in Threads, Create Public Threads, Add Reactions.
4. Enable Developer Mode in Discord (Settings → Advanced) to copy channel/message IDs (right-click → Copy ID).

## Credentials

Set `DISCORD_BOT_TOKEN`, or create `~/.config/discord-cli/credentials.json`:

```json
{ "botToken": "your-bot-token" }
```

Override the config path with `DISCORD_CLI_CONFIG`. Token precedence: env var first, then file.

## Allowlist (fail-closed on posts)

`~/.config/discord-cli/allowlist.json` (override with `DISCORD_ALLOWLIST`):

```json
{ "channels": [ { "alias": "general", "channelId": "123456789012345678", "serverId": "987654321098765432" } ] }
```

- Posts, replies, and thread-creates may only target allowlisted channels. A thread is gated by its **parent** channel.
- Reads and reactions accept raw channel IDs directly (ungated). An alias must be in the allowlist to resolve to an ID.
- **No allowlist file ⇒ nothing is postable** (fail-closed).
- A `--channel` value is matched first against aliases (case-insensitive), then treated as a raw channel ID. For writes, a raw ID must still be present in the allowlist.

## Commands

All commands print JSON by default; add `--format table` for a human summary.
Global flags: `--format json|table` (default `json`), `--profile <name>` (reserved; single identity in v1).

### `discord post`

```
discord post --channel <alias|id> --message "..."
```

Post a message. Options:

- `--channel <alias|id>` — target channel alias or raw ID
- `--message <text>` — message content (or pipe on stdin)
- `--reply-to <messageId>` — reply to this message (adds a Discord message reference)
- `--thread <threadId>` — post into an existing thread instead (gated by its parent channel)

If both `--channel` and `--thread` are given, `--thread` takes precedence. The message body can also be piped on stdin when `--message` is omitted.

### `discord read`

```
discord read --channel <alias|id> [--limit N] [--before <messageId>] [--after <messageId>]
```

Fetch recent messages. Options:

- `--channel <alias|id>` — channel alias or raw ID
- `--limit <n>` — max messages to return (1–100, default 25)
- `--before <messageId>` — only messages before this ID
- `--after <messageId>` — only messages after this ID

### `discord react`

```
discord react --channel <alias|id> --message <messageId> --emoji 👍
```

Add a reaction. Options:

- `--channel <alias|id>` — channel alias or raw ID
- `--message <messageId>` — target message ID
- `--emoji <emoji>` — unicode emoji, or custom emoji as `name:id`

### `discord thread create`

```
discord thread create --channel <alias|id> --from <messageId> --name "..."
```

Start a thread from an existing message (allowlist-gated by parent channel). Options:

- `--channel <alias|id>` — parent channel alias or raw ID
- `--from <messageId>` — message to start the thread from
- `--name <name>` — thread name
- `--auto-archive <minutes>` — auto-archive duration: `60` | `1440` | `4320` | `10080`

### `discord allow list`

```
discord allow list
```

Show allowlisted channels. Edit `~/.config/discord-cli/allowlist.json` by hand to add or remove entries.

### `discord doctor`

```
discord doctor
```

Verify the bot token, print the bot identity (username, ID, credential source) and allowlist channel count.

## Exit codes

`0` ok · `1` Discord API/network failure · `2` user-fixable config (missing token, bad input, unknown alias) · `3` blocked by the allowlist.

## Phase 2 — MCP wrapper (planned)

A thin MCP server will expose these same operations as structured tools, delegating to the
command modules so the allowlist gate is shared. Not built yet.
