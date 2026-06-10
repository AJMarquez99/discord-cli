import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { runPost } from './commands/post.js';
import { runRead } from './commands/read.js';
import { runReact } from './commands/react.js';
import { runThreadCreate } from './commands/thread.js';
import { runAllowList } from './commands/allow.js';
import { runDoctor } from './commands/doctor.js';
import { runChannels } from './commands/channels.js';
import { runAudit } from './commands/audit.js';
import { DiscordError, EXIT_CODES } from './lib/errors.js';
import {
  printJson, formatPost, formatRead, formatReact, formatThread,
  formatAllowList, formatDoctor, formatChannels, formatAudit,
} from './lib/format.js';

// Read piped stdin (non-TTY) so agents can stream a body: `echo "..." | discord post --channel x`.
async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function handle(fn, { table, preprocess } = {}, deps = defaultDeps) {
  return async (...actionArgs) => {
    const cmd = actionArgs[actionArgs.length - 1];
    const opts = cmd.opts();
    let root = cmd;
    while (root.parent) root = root.parent;
    const globalOpts = root.opts();
    try {
      if (preprocess) await preprocess(opts);
      const result = await fn(opts, deps);
      if (globalOpts.format === 'table' && table) {
        process.stdout.write(table(result) + '\n');
      } else {
        printJson(result);
      }
    } catch (err) {
      process.stderr.write((err.message || String(err)) + '\n');
      process.exitCode = err instanceof DiscordError ? err.exitCode : EXIT_CODES.GENERIC;
    }
  };
}

const postStdin = async (opts) => {
  if (!opts.message) {
    const piped = await readStdin();
    if (piped.trim()) opts.message = piped.replace(/\n+$/, '');
  }
};

export function buildProgram(deps = defaultDeps) {
  const program = new Command();
  program
    .name('discord')
    .description('Personal Discord CLI for agentic sessions (gh/gmail/gsc sibling)')
    .version('0.3.0')
    .option('--format <format>', 'output format: json|table', 'json')
    .option('--profile <name>', 'config profile (reserved; single identity in v1)');

  program
    .command('post')
    .description('Post a message to an allowlisted channel')
    .option('--channel <id>', 'target channel id')
    .option('--thread <threadId>', 'post into a thread (gated by its parent channel)')
    .option('--message <text>', 'message content (or pipe it on stdin)')
    .option('--reply-to <messageId>', 'reply to this message')
    .option('--unrestricted', 'open mode: any visible channel in an allowlisted server')
    .option('--dry-run', 'preview without sending or logging')
    .option('--no-audit', 'do not write this action to the audit log')
    .option('--log-body', 'include the message body in the audit entry')
    .option('--allow-everyone', 'permit @everyone/@here pings')
    .option('--allow-roles', 'permit role pings')
    .action(handle(runPost, { table: formatPost, preprocess: postStdin }, deps));

  program
    .command('read')
    .description('Read recent messages from an allowlisted channel')
    .option('--channel <id>', 'channel id')
    .option('--thread <threadId>', 'target a thread (gated by its parent channel)')
    .option('--limit <n>', 'max messages (1-100, default 25)')
    .option('--before <messageId>', 'only messages before this id')
    .option('--after <messageId>', 'only messages after this id')
    .option('--unrestricted', 'open mode: any visible channel in an allowlisted server')
    .action(handle(runRead, { table: formatRead }, deps));

  program
    .command('react')
    .description('Add a reaction to a message (allowlist-gated)')
    .option('--channel <id>', 'channel id')
    .option('--thread <threadId>', 'target a thread (gated by its parent channel)')
    .option('--message <messageId>', 'target message id')
    .option('--emoji <emoji>', 'unicode emoji or custom name:id')
    .option('--unrestricted', 'open mode: any visible channel in an allowlisted server')
    .option('--dry-run', 'preview without reacting or logging')
    .option('--no-audit', 'do not write this action to the audit log')
    .action(handle(runReact, { table: formatReact }, deps));

  const thread = program.command('thread').description('Thread operations');
  thread
    .command('create')
    .description('Create a thread from a message (allowlist-gated by parent channel)')
    .option('--channel <id>', 'parent channel id')
    .option('--from <messageId>', 'message to start the thread from')
    .option('--name <name>', 'thread name')
    .option('--auto-archive <minutes>', 'auto-archive duration: 60|1440|4320|10080')
    .option('--unrestricted', 'open mode: any visible channel in an allowlisted server')
    .option('--dry-run', 'preview without creating or logging')
    .option('--no-audit', 'do not write this action to the audit log')
    .action(handle(runThreadCreate, { table: formatThread }, deps));

  program
    .command('channels')
    .description("List a server's channels (names → ids; metadata only)")
    .option('--server <guildId>', 'guild/server id (defaults to the single allowlisted server)')
    .option('--type <type>', 'filter by type: text|voice|category|announcement|stage|forum')
    .action(handle(runChannels, { table: formatChannels }, deps));

  const allow = program
    .command('allow')
    .description('Inspect the channel + server allowlist (edit ~/.config/discord-cli/allowlist.json by hand)');
  allow
    .command('list')
    .description('List allowlisted channel ids and server ids')
    .action(handle(runAllowList, { table: formatAllowList }, deps));

  program
    .command('audit')
    .description('Show recent audited actions (newest first)')
    .option('--limit <n>', 'max entries (default 20)')
    .action(handle(runAudit, { table: formatAudit }, deps));

  program
    .command('doctor')
    .description('Verify the bot token; report mode, identity, allowlist + server counts')
    .action(handle(runDoctor, { table: formatDoctor }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
