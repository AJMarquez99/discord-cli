# Conventions

Standing rules for working in this codebase. The "why" behind most of these lives in
[[architecture]]; the threat model and guardrail requirements live in [[safety-spec]].

## Dependency injection is mandatory

- Command handlers have the signature `runXxx(opts, deps)` and reach the outside world **only**
  through `deps`. Never `import` `fs`, the Discord REST client, `process.env`, or the clock directly
  inside a command or library function that runs under a handler.
- New side effects go on `defaultDeps` in `src/deps.js`, then get used as `deps.thing(...)`
  (`resolveCredentials`, `createClient`, `loadAllowlist`, `loadConfig`, `appendAudit`, `readAudit`,
  `now`).
- Tests construct a fake `deps` of `vi.fn()` stubs. If something is hard to test, it's usually
  because a side effect escaped the `deps` object — fix that, don't mock around it.

## Two front-ends, one command layer

The CLI (`src/cli.js`) and the MCP server (`src/mcp/*`) are both thin front-ends over the same
`run*(opts, deps)` command modules. **All logic and all safety live in the command layer**, not the
front-ends.

- A new command is wired into **both** front-ends unless it is deliberately CLI-only: register it in
  `src/cli.js` and add an entry to the `TOOLS` table in `src/mcp/tools.js` (with a `mapArgs` that
  converts snake_case MCP args to camelCase opts).
- Never re-implement gating, mention-safety, or audit logic in a front-end. If both front-ends need
  it, it belongs in the command/lib layer so it can't drift.

## Output: JSON by default, table opt-in

- Every command returns a plain data object; `handle()` renders it. **Do not** `console.log` or
  print inside a command.
- JSON is the default. A `--format table` view is optional — if you add one, write a `format*`
  renderer in `src/lib/format.js` and pass it as `table` in the command's `handle(...)` registration.

## Exit codes are part of the contract

Throw the right error class from `src/lib/errors.js` so the exit code is correct:

| Situation | Throw | Exit |
|---|---|---|
| user-fixable config / bad flags | `InvalidInputError` | `2` |
| no token found | `MissingCredentialsError` | `2` |
| unparseable JSON in config/allowlist | `MalformedConfigError` | `2` |
| channel/thread blocked by the allowlist or mode | `ChannelNotAllowedError` | `3` |
| non-OK Discord HTTP response | `DiscordApiError` | `1` |
| network / unexpected | any plain `Error` | `1` |
| success | return data normally | `0` |

`handle()` maps any non-`DiscordError` to exit `1`, so reserve plain `throw new Error()` for
genuinely unexpected failures.

## The content gate is fail-closed — keep it that way

- All **content** access (`post`, `read`, `react`, `thread create`, and the `--thread` variants) goes
  through `gateChannel` / `gateThreadParent` in `src/allowlist.js`. **Discovery** (`channels`) is the
  only ungated path and returns metadata only.
- A **missing** allowlist file means "deny everything," not "allow all." In **restricted** mode only
  IDs in `allowlist.channels` pass. In **open** mode, channels in an allowlisted **server** also pass —
  but with **zero servers listed, open grants nothing new**.
- A blocked channel rejects the whole operation with exit `3` (or, for `--dry-run`, **returns**
  `blocked: true` at exit `0` without calling any write API). Don't add implicit bypasses; the only
  escape hatches are the explicit `--unrestricted` flag / `mode: "open"` config and the per-action
  `--no-audit`.

## Mention safety defaults to suppressed

`buildAllowedMentions` (`src/lib/mentions.js`) defaults to `{ parse: ["users"] }` — `@everyone`,
`@here`, and role pings are stripped unless the caller passes `--allow-everyone` / `--allow-roles`.
Keep new message-sending paths routed through this builder; never hand-build an `allowed_mentions`
object that re-enables mass pings by default.

## Privacy invariants

- The audit log (`audit.jsonl`) is **metadata-only**. Message bodies are excluded unless `--log-body`
  / `config.auditLog.logBody`. **Read content is never logged.**
- Credentials live in `~/.config/discord-cli/` at `chmod 600`, never in the repo. `credentials.json`,
  `config.json`, `allowlist.json`, and `audit.jsonl` are runtime files — they must never be committed.
- Examples and tests use **placeholder** IDs only (e.g. `123456789012345678` / `987654321098765432`
  in docs, `111111111111111111` in tests). Never paste a real channel/guild ID or bot token anywhere
  in the repo or its history.

## Profiles: don't break the unused seam

`resolveCredentials({ profile })` and `loadAllowlist({ profile })` accept a `profile` argument that is
forwarded from `--profile` but unused in v1 (`_profile`). Any change to credential/allowlist/config
path resolution must keep the no-profile path working exactly as today — adding real multi-bot
profiles must stay a non-breaking extension.

## Testing

- Framework: `vitest`. Run the suite with **`npm run test:run`** (one-shot). `npm test` is watch
  mode — don't use it in scripts/CI/agents.
- Every new command or library function ships with tests that inject a fake `deps`. **No live network
  in tests** — `fetchImpl` and `sleep` on the REST client are injectable for exactly this reason.
- The `TOOLS` table is unit-tested: each `mapArgs` is exercised and each `command` checked against its
  expected `run*` import. Keep that coverage when adding MCP tools.

## Commits & releases

- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`, …).
- This repo's `.ai/` is committed (public), governed by `.ai/.gitignore` (`_*` = local-only).
  `.ai/plans/` and `.ai/context/` contents are kept **local**, not shipped. Commit `.ai/` changes by
  explicit path — don't `git add -A` blindly.
- Branch flow is **feature → PR → `staging` (squash) → PR → `main` (merge)**; `main` merges require
  `quality` + `ci` green. Releasing is tag-driven via `release.yml`.
