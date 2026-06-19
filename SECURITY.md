# Security Policy

## Supported versions

`discord-cli` is distributed through npm and the latest published version is the only one
supported. Please upgrade to the latest release before reporting an issue.

## Reporting a vulnerability

Please **do not** open a public issue for a vulnerability.

Instead, use GitHub's private reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private advisory.

If you'd rather email, write to **alejandromarquez@live.com** with details and steps to
reproduce. I'll acknowledge within a few days and keep you updated on the fix.

## How the CLI handles secrets and access

- The bot token is read from `DISCORD_BOT_TOKEN` or `~/.config/discord-cli/credentials.json`. It
  is never written to the repo.
- Channel content access (post, read, react, thread) is **fail-closed** through the allowlist:
  with no allowlist file, nothing is reachable. The audit log records **metadata only** unless
  you opt in with `--log-body`.
- Outgoing messages are **mention-safe by default** — `@everyone`/`@here`/role mentions are
  stripped unless explicitly allowed.

If you find a way to make the CLI leak the token, bypass the allowlist or mode restrictions, or
send unintended mass-mentions, please report it through the private channel above.

## Good hygiene for users

Never commit your `~/.config/discord-cli/` files or paste a bot token into an issue, PR, or log.
Regenerate the token from the Discord Developer Portal if you suspect it has been exposed.
