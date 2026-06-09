import { Command } from 'commander';
import { defaultDeps } from './deps.js';
import { runPost } from './commands/post.js';
import { runRead } from './commands/read.js';
import { runReact } from './commands/react.js';
import { runThreadCreate } from './commands/thread.js';
import { runAllowList } from './commands/allow.js';
import { runDoctor } from './commands/doctor.js';
import { DiscordError, EXIT_CODES } from './lib/errors.js';
import { printJson, formatPost, formatRead, formatReact, formatThread, formatAllowList, formatDoctor } from './lib/format.js';

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

export function buildProgram(deps = defaultDeps) {
  const program = new Command();
  program
    .name('discord')
    .description('Personal Discord CLI for agentic sessions (gh/gmail/gsc sibling)')
    .version('0.1.0')
    .option('--format <format>', 'output format: json|table', 'json')
    .option('--profile <name>', 'config profile (reserved; single identity in v1)');

  program
    .command('post')
    .description('Post a message to a channel (allowlist-gated)')
    .option('--channel <alias|id>', 'target channel alias or id')
    .option('--thread <threadId>', 'post into a thread (gated by its parent channel)')
    .option('--message <text>', 'message content (or pipe it on stdin)')
    .option('--reply-to <messageId>', 'reply to this message')
    .action(
      handle(
        runPost,
        {
          table: formatPost,
          preprocess: async (opts) => {
            if (!opts.message) {
              const piped = await readStdin();
              if (piped.trim()) opts.message = piped.replace(/\n+$/, '');
            }
          },
        },
        deps,
      ),
    );

  program
    .command('read')
    .description('Read recent messages from a channel')
    .option('--channel <alias|id>', 'channel alias or id')
    .option('--limit <n>', 'max messages (1-100, default 25)')
    .option('--before <messageId>', 'only messages before this id')
    .option('--after <messageId>', 'only messages after this id')
    .action(handle(runRead, { table: formatRead }, deps));

  program
    .command('react')
    .description('Add a reaction to a message')
    .option('--channel <alias|id>', 'channel alias or id')
    .option('--message <messageId>', 'target message id')
    .option('--emoji <emoji>', 'unicode emoji or custom name:id')
    .action(handle(runReact, { table: formatReact }, deps));

  const thread = program.command('thread').description('Thread operations');
  thread
    .command('create')
    .description('Create a thread from a message (allowlist-gated by parent channel)')
    .option('--channel <alias|id>', 'parent channel alias or id')
    .option('--from <messageId>', 'message to start the thread from')
    .option('--name <name>', 'thread name')
    .option('--auto-archive <minutes>', 'auto-archive duration: 60|1440|4320|10080')
    .action(handle(runThreadCreate, { table: formatThread }, deps));

  const allow = program.command('allow').description('Inspect the channel allowlist (edit ~/.config/discord-cli/allowlist.json by hand)');
  allow
    .command('list')
    .description('List allowed channels and aliases')
    .action(handle(runAllowList, { table: formatAllowList }, deps));

  program
    .command('doctor')
    .description('Verify the bot token and report identity + allowlist count')
    .action(handle(runDoctor, { table: formatDoctor }, deps));

  return program;
}

export function run(argv, deps = defaultDeps) {
  return buildProgram(deps).parseAsync(argv);
}
