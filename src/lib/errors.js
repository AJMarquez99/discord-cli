// Exit codes mirror gmail-cli / gsc-cli: 2 = user-fixable config, 3 = allowlist block, 1 = everything else.
export const EXIT_CODES = {
  GENERIC: 1, // unexpected / Discord API / network failure
  CONFIG: 2, // user-fixable config (missing token, bad input, unknown alias)
  FORBIDDEN: 3, // target channel blocked by the allowlist policy
};

export class DiscordError extends Error {
  constructor(message, exitCode = EXIT_CODES.GENERIC) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class MissingCredentialsError extends DiscordError {
  constructor(path) {
    super(
      `No Discord bot token found.\n` +
        `Set DISCORD_BOT_TOKEN, or create ${path} with:\n` +
        `  { "botToken": "your-bot-token" }\n` +
        `Create a bot at https://discord.com/developers/applications (Bot → Reset Token).`,
      EXIT_CODES.CONFIG,
    );
  }
}

export class InvalidInputError extends DiscordError {
  constructor(message) {
    super(message, EXIT_CODES.CONFIG);
  }
}

export class ChannelNotAllowedError extends DiscordError {
  constructor(denied, detail) {
    super(
      `Blocked by allowlist — not permitted to post to: ${denied}` +
        (detail ? ` (${detail})` : '') +
        `\nNothing was sent. Add the channel (alias + channelId) to the allowlist, then retry.\n` +
        `Allowlist: ~/.config/discord-cli/allowlist.json (DISCORD_ALLOWLIST overrides). See \`discord allow list\`.`,
      EXIT_CODES.FORBIDDEN,
    );
    this.denied = denied;
  }
}

export class DiscordApiError extends DiscordError {
  constructor(status, data) {
    const msg = data && data.message ? data.message : 'Unknown error';
    const code = data && data.code != null ? ` (code ${data.code})` : '';
    super(`Discord API ${status}: ${msg}${code}`, EXIT_CODES.GENERIC);
    this.status = status;
    this.data = data;
  }
}
