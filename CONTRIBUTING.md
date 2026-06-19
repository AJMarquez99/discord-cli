# Contributing to discord-cli

Thanks for helping improve `discord-cli`. It's a small, REST-only wrapper around the Discord
API (no SDK) with a fail-closed allowlist — contributions that keep it lean and safe-by-default
are very welcome.

## Getting started

```bash
git clone https://github.com/AJMarquez99/discord-cli.git
cd discord-cli
npm install
```

`discord-cli` targets **Node.js >= 20**.

## Running the tests and linter

```bash
npm run test:run   # run the vitest suite once
npm test           # vitest in watch mode
npm run lint       # eslint
```

Please add or update tests for any behavior you change, and make sure `npm run test:run` and
`npm run lint` both pass before opening a pull request. Tests must **never** contact Discord —
use the existing mocks/fixtures.

## A note on credentials

Never commit a bot token or a real allowlist. The CLI reads those from
`~/.config/discord-cli/` at runtime; nothing sensitive belongs in the repo. Channel content
access is **fail-closed** through the allowlist by design — please preserve that default, and
keep mention-safety (stripping `@everyone`/`@here`/roles) on by default in any change.

## Making changes

- Keep changes **small and focused** — one logical change per pull request.
- Match the existing style and the JSON-by-default output contract.
- The CLI and the `discord-mcp` server share one gated command layer — when you change
  behavior, keep both paths consistent.
- Update the README when you add or change a flag or command.

## Submitting a pull request

1. Fork the repo and create a branch from `main`.
2. Make your change with accompanying tests.
3. Run `npm run test:run` and `npm run lint`, and confirm both are green.
4. Open a pull request describing **what** changed and **why**.

## Reporting issues

Use the issue templates for bugs and feature requests. For anything security-sensitive, follow
[SECURITY.md](./SECURITY.md) — please don't open a public issue for a vulnerability.

By contributing, you agree that your contributions are licensed under the project's
[MIT License](./LICENSE) and that you'll follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
