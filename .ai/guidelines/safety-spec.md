# Safety Specification — discord-cli

**Status:** authoritative safety standard for discord-cli. **Audience:** anyone building, modifying,
or forking discord-cli, and the AI agents that operate it. Companion docs live in `.ai/guidelines/`
and `.ai/knowledge/`.

Requirement keywords **MUST / MUST NOT / SHOULD / SHOULD NOT / MAY** are used in the RFC 2119 sense.
Each requirement is tagged (e.g. `SEC-3`) so reviews can cite it.

---

## 1. Why this spec exists

discord-cli is not an ordinary CLI. It is **built to be driven by AI coding agents** — invoked
autonomously, in loops, often without a human reading each command. It reaches an **external,
hard-to-undo destination** (a posted message is immediately visible), and it **reads untrusted
content** (channel messages) that an agent will then reason over.

That combination is the **"lethal trifecta"**:

1. **Access to private/sensitive data** — private channels and the bot token on disk.
2. **Exposure to untrusted content** — channel messages, any of which may carry a prompt injection
   aimed at the agent.
3. **The ability to communicate externally** — posting messages, reactions, and threads.

A tool with all three is one successful prompt injection away from exfiltrating private data to an
attacker. discord-cli deliberately sits at that intersection, so **safety is the primary design
constraint, not a feature.**

## 2. Core stance

> **The operating agent is treated as a partially-trusted, possibly-compromised actor.**

Defenses **MUST be structural, not behavioral.** We do not rely on the agent *choosing* to be safe,
*understanding* the rules, or *not having been injected*. We constrain what discord-cli will
physically do regardless of what the agent intends or has been told to do. Three consequences:

- **The agent cannot move its own boundary.** Anything that widens reach — the channel allowlist, the
  restricted/open mode — is owned by the human and is **not reachable through agent-facing surfaces**
  (§5.2, §5.8).
- **High-consequence actions are bounded and reviewable**, not blocked outright: posting stays
  available, but every content op is gated by the allowlist and recorded for a human (§5.3, §5.5).
- **The bot token never enters the agent's world** — not in arguments, output, logs, or error text
  (§5.1).

## 3. Threat model

### 3.1 Actors

| Actor | Trust | Notes |
|---|---|---|
| **The human owner** | trusted | Curates the allowlist, holds the bot token, accountable for the bot. The only actor permitted to widen the boundary. |
| **The operating agent** | **partially trusted** | May be capable and well-aligned, but may also be prompt-injected, mistaken, or looping. Treated as potentially adversarial for boundary-affecting actions. |
| **Untrusted content authors** | **untrusted** | Anyone who can post where the agent will read. Assume their messages contain instructions aimed at the agent. |
| **External recipients** | untrusted | The channels where posts land. The blast radius if the agent is subverted. |

### 3.2 Threat catalog

- **T1 — Injection-driven exfiltration.** A channel message instructs the agent to post private data
  to an attacker-visible channel. *Primary threat.*
- **T2 — Boundary self-escalation.** The agent (injected or mistaken) tries to add a channel, switch
  to open mode, or pass a bypass flag to widen its own reach.
- **T3 — Credential capture.** The bot token leaks via a flag (shell history / process table / the
  agent's own transcript), a log line, an error message, or a command return value.
- **T4 — Irreversible / high-volume action.** A single bad post is immediately public; a loop produces
  mass unwanted posts.
- **T5 — Confused deputy.** The tool acts with the bot's authority on behalf of an untrusted
  instruction, with no record tying the action back for review.
- **T6 — Silent unsafe degradation.** A failure or misconfig quietly drops the tool into a less-safe
  state (e.g. "allow all" on a missing file) instead of failing closed.
- **T7 — Content exfiltration within the boundary.** Even when channels are allowlisted, the agent
  leaks secrets *into the content* of an allowed message. *Partially out of scope — see §7.*

## 4. Invariants (non-negotiable)

A change that violates one is a security regression, not a feature.

- **I1 — Fail closed.** A missing or unreadable allowlist means **nothing is accessible**, never
  "allow all."
- **I2 — The boundary is human-owned.** No agent-facing surface may add to the allowlist or change
  mode. Widening is a human edit to `allowlist.json` / `config.json`.
- **I3 — The bot token is never agent-visible.** Not in args, output, logs, or errors. Prompt-only
  entry; `chmod 600` on disk; resolved through credentials code, never echoed.
- **I4 — No partial side effects.** A disallowed channel rejects the **whole** operation (exit 3).
- **I5 — Every side effect is recorded.** Each successful post/react/thread appends a metadata audit
  entry a human can review.
- **I6 — Honest failure.** Errors surface with the correct exit code; the tool never claims an action
  it didn't perform and never silently downgrades safety.

## 5. Requirements

### 5.1 Credentials & secrets — defends T3

- **SEC-1 (MUST)** The bot token lives only in `~/.config/discord-cli/credentials.json` at
  `chmod 600`, or in the `DISCORD_BOT_TOKEN` env var. It MUST NOT be committed, and the config dir's
  secret files MUST be gitignored.
- **SEC-2 (MUST NOT)** Accept the bot token as a CLI flag or positional — flags leak into shell
  history, the process table, and the agent's own transcript. Entry is an **interactive hidden
  prompt** (`discord login`, echo off) or a hand-placed file.
- **SEC-3 (MUST NOT)** Return, log, or include the bot token in any command result, audit entry, or
  error message. A credential error names the **path**, never the value.
- **SEC-4 (SHOULD)** Resolve credentials through a single loader; a missing file ⇒ a clear "missing"
  (exit 2), a malformed file ⇒ a clear "malformed" (exit 2) — **not** a raw parser error at exit 1.
  (`MalformedConfigError` is thrown for unparseable config/allowlist/credentials files.)
- **SEC-5 (SHOULD)** Setup that writes secrets MUST NOT be exposed to agents (no MCP `login`; §5.8).

### 5.2 The safety boundary: channel allowlist & mode — defends T1, T2

- **BND-1 (MUST)** Every content op (post/read/react/thread) passes through the **fail-closed gate**
  (`gateChannel` / `gateThreadParent`) before any write. A blocked channel throws and exits **3**.
  Channel *discovery* (`discord channels`) is metadata-only and ungated.
- **BND-2 (MUST)** The allowlist bounds **channels** (and, in open mode, servers) and is the
  load-bearing defense against injection-driven exfiltration (T1): even a fully-compromised agent can
  only reach pre-approved channels.
- **BND-3 (MUST)** Widening the boundary is a **human action on a file** (editing `allowlist.json` /
  `config.json`). A *read* view (`discord allow list`) is fine, but boundary **writes** (adding a
  channel, setting `mode: open`) MUST stay CLI-only and MUST NOT be reachable by an agent (§5.8).
- **BND-4 (MUST)** Nothing is implicitly allowed. No wildcard / "allow all" default. In open mode, a
  non-allowlisted channel is permitted only if its **server** is allowlisted; with zero servers
  listed, open mode grants nothing.
- **BND-5 (SHOULD)** `discord doctor` reports the active mode and allowlist/server counts so a human
  or agent can see the current reach without trial posts.

### 5.3 Outbound (post / react / thread) — defends T4

- **ACT-1 (MUST)** Every side-effecting command supports `--dry-run`: run the gate, preview, perform
  **no** write and **no** audit entry. A gate block under dry-run is *returned* (not thrown) so an
  agent can pre-check safely.
- **ACT-2 (SHOULD)** In untrusted-input contexts, agents SHOULD `--dry-run` first and a human or
  orchestrator SHOULD inspect the preview before the real action.
- **ACT-3 (SHOULD)** Make blast radius visible and bounded — never expand a single request into a
  mass post.
- **ACT-4 (MUST NOT)** Auto-include content the caller didn't explicitly specify. The content of a
  post is exactly what was asked for.

### 5.4 Reading untrusted content — defends T1, T5

- **RD-1 (MUST)** Read paths (`discord read`) are **read-only with respect to content** and MUST NOT
  perform a post or other outbound effect as a result of message text.
- **RD-2 (SHOULD)** Returned messages are plain data the caller MUST treat as **untrusted** — the tool
  does not pre-interpret them as instructions. Not executing instructions found in fetched messages is
  the agent/orchestrator's responsibility; the tool's job is to not amplify them.
- **RD-3 (SHOULD)** Fetched message content MUST NOT be written into the audit log (§5.5).

### 5.5 Logging & accountability — defends T5, enables review of T1/T4

- **LOG-1 (MUST)** Each successful post/react/thread appends one **metadata-only** entry to
  `~/.config/discord-cli/audit.jsonl`: timestamp, action, channel/message ids, mode, allowlisted flag
  — enough for a human to review *what the agent did*.
- **LOG-2 (MUST)** Message bodies are **excluded by default**; inclusion is explicit opt-in
  (`--log-body` / `config.auditLog.logBody`). Fetched (read) content is **never** logged (§5.4).
- **LOG-3 (MUST)** A log-write failure **warns** to stderr but MUST NOT fail or roll back the action,
  and MUST NOT be silently swallowed.
- **LOG-4 (SHOULD)** The log is append-only; an agent SHOULD NOT be given a tool to delete or rewrite
  it.

### 5.6 Failure behavior & honesty — defends T6

- **FAIL-1 (MUST)** Use the exit-code contract: `0` ok · `1` Discord API/network/unexpected · `2`
  user-fixable config/input · `3` blocked by the allowlist/mode. The code is part of the API an
  orchestrator relies on to detect a block.
- **FAIL-2 (MUST NOT)** Degrade to a less-safe mode on error. A missing/broken allowlist MUST fail
  closed (I1), never "allow all."
- **FAIL-3 (MUST)** Report outcomes faithfully — no success claim without the action having occurred;
  a blocked or dry-run action says so explicitly in its result.

### 5.7 Escalation & bypasses — defends T2

- **ESC-1 (MUST)** Every bypass is **explicit, named, and off by default**: `--unrestricted`
  (per-command), `DISCORD_MODE=open` (env), `mode: open` (config). There are no implicit bypasses.
- **ESC-2 (MUST)** Open mode MUST be **visible** — surfaced by `doctor` — so a human can notice the
  gate is widened.
- **ESC-3 (SHOULD)** Bypasses are for **human-set** use. Agent-facing surfaces MUST NOT expose them
  (an MCP tool MUST NOT take an `unrestricted` arg; §5.8).
- **ESC-4 (SHOULD)** Even under open mode, the boundary SHOULD still apply where it can — a
  non-allowlisted channel needs an allowlisted **server**; open with zero servers grants nothing.

### 5.8 Agent-facing surfaces (the `discord-mcp` server & flags) — defends T1, T2, T3

- **MCP-1 (MUST)** MCP tools delegate to the **same gated command functions** as the CLI — never a
  parallel path that skips the gate. The allowlist, mode, mention-safety, dry-run, and audit log apply
  identically.
- **MCP-2 (MUST NOT)** Expose any operation that **mutates the safety boundary or writes secrets**: no
  allowlist add/remove, no `config set` that can flip the mode, no `login`, no `init`. *A tool gated by
  a boundary must never be able to move that boundary.*
- **MCP-3 (MUST NOT)** Accept bypass arguments — an MCP tool MUST NOT take an `unrestricted` arg. The
  agent operates inside the boundary the human set.
- **MCP-4 (MUST)** Surface a gate block as a structured, non-crashing error (MCP `isError: true`) so
  the orchestrator sees the denial — never a server crash, never a silent pass.
- **MCP-5 (SHOULD)** The exposed surface is the **operational verbs only** (post, read, react, thread,
  channels, `allow list`, audit-read, doctor). Setup/admin verbs stay CLI-only.
- **MCP-6 (MUST)** Content safety still applies: **mention-safety on** (`@everyone`/`@here`/role pings
  suppressed unless explicitly permitted), body-logging off by default.

### 5.9 Identity & least privilege — limits blast radius of T1, T4

- **ID-1 (SHOULD)** Run discord-cli under a **dedicated bot**, not an account tied to your primary
  identity — so a subverted agent's reach is isolated.
- **ID-2 (SHOULD)** Grant the bot the **minimum permissions** it uses (View Channel, Read Message
  History, Send Messages, and only the extras a command needs), in only the servers it must reach.
- **ID-3 (MUST)** Credential/identity resolution is **unambiguous**: the tool errors rather than
  guessing when inputs are ambiguous. An agent must never silently act under the wrong identity.

## 6. Conformance checklist

Use at review time; cite the requirement IDs.

- [ ] **Fail-closed** on missing/broken allowlist (I1, BND-1, FAIL-2)
- [ ] **No partial** side effects — one blocked channel fails the whole op, exit 3 (I4)
- [ ] Bot token: **no secret-bearing flags** (SEC-2), not in output/logs/errors (SEC-3),
      `chmod 600` (SEC-1)
- [ ] Malformed config/credentials/allowlist ⇒ **exit 2 with a clear message** (SEC-4)
- [ ] `--dry-run` on post/react/thread does no write + no audit entry (ACT-1)
- [ ] Read paths are side-effect-free; fetched content never logged (RD-1, RD-3, LOG-2)
- [ ] Metadata-only audit log; body off by default; write-fail warns not fails (LOG-1..3)
- [ ] Exit-code contract honored (FAIL-1); no success claim without the action (FAIL-3)
- [ ] All bypasses explicit, off by default, **visible in `doctor`** (ESC-1, ESC-2)
- [ ] **MCP:** delegates to gated commands (MCP-1); exposes **no** boundary-write / secret-write /
      bypass surface (MCP-2, MCP-3); blocks return structured errors (MCP-4); mention-safety on (MCP-6)
- [ ] Dedicated, least-privilege bot; unambiguous identity resolution (ID-1..3)

## 7. Residual risks & the owner's responsibilities (non-goals)

This spec makes discord-cli **structurally hard to misuse**, but it does **not** make it
unconditionally safe:

- **Content exfiltration within the boundary (T7).** The allowlist bounds *which channels* an action
  reaches, **not what it says.** A subverted agent can still leak secrets into the *content* of a
  message to an allowed channel. Treat the allowlist as a **trust boundary, not a content filter** —
  keep it tight, use a dedicated bot, and review the audit log.
- **Allowed-but-unwanted posts.** Injection can still cause a *permitted* post the owner didn't
  actually want. The tool verifies the *destination* is permitted, not that the owner authorized a
  *specific* message.
- **The agent's own reasoning is out of scope.** discord-cli constrains *actions*, not the agent's
  interpretation of untrusted messages.

**The owner therefore MUST:** curate the allowlist conservatively; use a dedicated, least-privilege
bot; keep restricted mode on except when deliberately and temporarily using open mode; and
periodically review `audit.jsonl` to see what the agent actually did.

## 8. Change control

This spec is a **standing rule**: a change that weakens a MUST is a security regression and needs an
explicit, recorded decision — not a silent edit. discord-cli MUST conform before shipping any
agent-facing surface (the CLI is the floor; the MCP server raises the bar to §5.8). When a new threat
or mitigation emerges, update this file and re-review against the §6 checklist.
