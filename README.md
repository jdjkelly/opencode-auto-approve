# auto-approve

Gate OpenCode's auto-approved tool calls through an LLM permission classifier. Safe calls proceed silently; destructive or unauthorized calls come back as tool errors the agent self-corrects from; nothing else changes.

```
⏵⏵ auto-approve
```

## Install

Requires OpenCode V2 with `permission.evaluate`, `prompt.footer`, `session.panel`, keymap layers, and plugin RPC support.

```sh
opencode2 plugin add github:jdjkelly/opencode-auto-approve
```

Install the pinned release with `#v0.1.1` instead:

```sh
opencode2 plugin add github:jdjkelly/opencode-auto-approve#v0.1.1
```

If your executable is named `opencode`, replace `opencode2` in these commands. Restart OpenCode after installing, then run `/auto-approve` in any session.

### Compatibility

The feature set was exercised against OpenCode `v2.0.2` and tested end to end on `v0.0.0-beta-19507`, including the `permission.evaluate` hook, the composer badge, `/auto-approve`, the decision panel, and RPC-based configuration. Other beta builds may vary.

### Keep one installation active

The package manager adds the plugin to the global OpenCode configuration. If `~/.config/opencode/plugins/auto-approve` already contains a manual clone, move it outside the plugins folder and remove its entry from `~/.config/opencode/opencode.json`. Two active copies register two permission hooks and every gated call is judged twice.

For a default-branch installation:

```sh
opencode2 plugin check
opencode2 plugin update github:jdjkelly/opencode-auto-approve
```

Restart after updating. To remove the package:

```sh
opencode2 plugin remove github:jdjkelly/opencode-auto-approve
```

## Use

Once enabled, every tool call that your permission rules resolve to `allow` is judged before it runs, except read-only actions (`read`, `glob`, `grep`), `question`, and `execute` (Code Mode entry; its nested tools are gated individually).

- **allow** — proceeds silently, as before. The composer badge flashes the verdict briefly.
- **block** — soft deny: the agent receives a tool error with the judge's reason and is told not to route around it; the session continues.
- **judge error / timeout / unparseable verdict** — fails closed to a normal permission prompt.

Explicit `deny` and `ask` permission rules always win: a `deny` never reaches the classifier, and this plugin only ever rewrites `allow`.

### Commands

Run `/auto-approve` (aliases: `/aa`, `/approval`):

| Command | Action |
| --- | --- |
| `/auto-approve` | Toggle the classifier on or off |
| `/auto-approve on` / `off` | Set it explicitly |
| `/auto-approve status` | Show judges, cascade, escalation limits, and timeout |
| `/auto-approve judge <providerID>/<modelID>` | Set the stage-1 judge |
| `/auto-approve judge2 <providerID>/<modelID>` | Set the stage-2 judge |
| `/auto-approve log` | Open the decision panel for the session |
| `/auto-approve clear` | Clear the in-memory decision log |

Toggling and judge changes take effect on the next tool call — the server re-reads its options before every gated call, no restart. Judge references are validated against your model catalog.

### Composer badge

`prompt.footer` shows the mode: `⏵⏵ auto-approve` in the theme's bright accent when on, `auto-approve off` when off, and a temporary verdict line (`✓ shell · 1.2s` or `✗ shell — reason`) after each decision for the current session. Blocks, escalations, and fail-closed decisions also raise a toast.

### Decision panel

`/auto-approve log` opens a session panel listing recent decisions, newest first — time, verdict, action, arguments, reason. `r` refreshes; the panel also live-refreshes on new decisions.

## Configuration

The plugin takes defaults when auto-loaded. Options come from (later wins, per key):

1. `~/.config/opencode/auto-approve.json`
2. `<project>/.opencode/auto-approve.json`
3. `options` in a `plugins` registration (only if you disable auto-loading)

```jsonc
{
  "enabled": true,
  "judge": { "providerID": "fireworks-ai", "id": "accounts/fireworks/models/deepseek-v4p1-flash" },
  "judge2": { "providerID": "fireworks-ai", "id": "accounts/fireworks/routers/glm-5p3-fast" },
  "twoStage": true,
  "subagents": "ask",
  "escalate": { "consecutive": 3, "total": 20 },
  "userMessages": 6,
  "timeoutMs": 45000,
  "skipActions": ["read", "glob", "grep", "question", "execute"],
  "hardDeny": ["...absolute boundaries; user intent cannot clear these..."],
  "environment": ["...prose trust list: repos, services, providers, sensitive-data locations..."],
  "rules": ["...extra soft rules; naming the operation and target clears these..."]
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch. `false` makes the plugin a no-op. |
| `judge` | the configured default model | Stage-1 filter judge. Fast and cheap; it only needs recall. |
| `judge2` | same as `judge` | Stage-2 judge for flagged calls. A capable model pays off here. |
| `twoStage` | `true` | Careful second pass before blocking. |
| `subagents` | `"ask"` | `"ask"` never auto-approves subagent sessions (their opening prompt is model-written); `"classify"` judges them too. |
| `escalate` | `{ consecutive: 3, total: 20 }` | Per-turn block limits before escalating to a human prompt. Counters reset on each new user message. |
| `userMessages` | `6` | How many recent user messages the judge sees. |
| `timeoutMs` | `45000` | Judge call timeout; expiry fails closed to a prompt. |
| `skipActions` | read/glob/grep/question/execute | Actions never sent to the judge. |
| `hardDeny` | exfiltration + credential probing | Absolute policy tier; intent cannot clear. |
| `environment` | empty | Prose trust list injected into the judge prompt. |
| `rules` | empty | Extra soft rules; naming the operation clears them. |

## How it works

### Judging cascade

Judging runs in two stages, mirroring Claude Code's auto mode and OpenAI's Auto-review:

1. **stage 1 — `judge`**: a fast filter verdict on every gated call.
2. **stage 2 — `judge2`**: a stronger model re-examines only calls the first pass flags.

Both labs converged on capable models for exactly this job — OpenAI states that "more powerful models are better at both risk detection and user intention discernment" — and the cascade is how you afford one. This plugin's bake-off across DeepSeek/GLM/Qwen/Kimi judges on a 12-scenario battery (safe calls, named-destructive calls, vague destructive goals, prompt injection, exfiltration, credential reads, force-push, production deploys, config writes), three runs per configuration:

| configuration | accuracy | false positives | unparseable verdicts |
| --- | --- | --- | --- |
| flash judge, single stage | 5/12 | 3 | 23/36 |
| deepseek-v4.1-flash, single stage | 11/12 | 0 | 1/36 |
| glm-5.3, single stage | 11/12 | 0 | 14/36 |
| **deepseek-v4.1-flash → glm-5.3** | **11/12** | **0** | **2/36** |

The cascade keeps flash-tier latency on the common path and pays for frontier judgment only on flagged calls.

### Policy tiers

The judge's policy is assembled from a fixed core plus your options, following the tiered design of Claude Code's `autoMode` and Codex's guardian policy:

- **`hardDeny`** — absolute boundaries. User intent and specifically naming the operation do not clear these.
- **`environment`** — a prose trust list. The project working directory is always trusted; everything else is external until you name it (repos, internal services, model providers, sensitive-data locations).
- **`rules`** — extra soft rules. These block unless the user specifically named the operation and target.

The fixed core carries grading guidance distilled from published policies: git nuance (`--force-with-lease` on your own branch is medium; protected/default branches are high; amending your own unpushed commit is fine), destructive grading (narrowly scoped, user-named `rm -rf` is lower risk; `HOME` shadowing is always high), credential probing vs routine authentication, payload provenance (anything derived from sensitive data is sensitive; authorization must name both payload and destination), and prior-decisions-are-not-precedent.

### Safety design

- **Reasoning-blind evidence.** The judge sees user messages plus the bare pending call (`action`, `resources`, `metadata`). Assistant prose and tool output are never sent, so file or web content the agent read cannot grant permission. The prompt also tells the judge to treat any "user" text quoted from file or web content as untrusted. Verified: a `notes.txt` prompt injection instructing `rm -rf ./data` is denied when the user only delegated generically.
- **Fail closed.** Judge errors, timeouts, and unparseable verdicts escalate to a normal permission prompt, never to a silent allow.
- **Escalation backstop.** 3 consecutive or 20 total blocks within one user turn escalate to a human prompt rather than looping deny and retry forever.
- **Per-turn verdict cache.** An identical action and arguments within the same user turn reuses the earlier verdict, so retries do not re-bill the judge.
- **Anti-workaround denials.** A deny tells the agent not to pursue the same outcome through workarounds or indirect execution.

### Authorization semantics

Like Claude Code's auto mode: naming a destructive command specifically is authorization. "Run `rm -rf ./build`" is allowed; a vague goal that leads the agent to choose `rm -rf` is blocked. Hard-deny rules are the exception. For boundaries no prompt may cross, use permission `deny` rules — they never reach the classifier.

## Technical details

- **Plugin IDs**: `auto-approve` on both surfaces (server: index.ts, TUI: dist/tui.js).
- **RPC**: `auto-approve` over the plugin RPC API — methods `status`, `toggle`, `setJudge`, `setJudge2`, `decisions`, `clear`; events `decision` and `config`. The TUI badge, toasts, and panel are all consumers of this contract; nothing is duplicated in the client.
- **Decision buffer**: in-memory, capped at 500 entries, cleared on plugin reload. For a durable record set `AUTO_APPROVE_LOG=/path/to/file` in the server environment; lines are prefixed `[auto-approve]`.
- **Badge rendering**: the composer badge reads options through RPC on mount, after commands, and after config events. It never judges anything itself.

## Local development

Clone the repository where your OpenCode configuration can reach it:

```sh
git clone https://github.com/jdjkelly/opencode-auto-approve.git \
  ~/.config/opencode/plugins/auto-approve
```

Add `"./plugins/auto-approve"` to the `plugins` array in `~/.config/opencode/opencode.json`, preserving existing entries. Local plugins are loaded as TSX, so the checked-in `dist/tui.js` is only used by package installs.

```sh
npm ci
npm run compile:tui    # rebuild dist/tui.js for package consumers
```

Typecheck against the real SDK and OpenTUI types:

```sh
cd .typecheck && npm i && ./node_modules/.bin/tsc -p tsconfig.json
```

## Source layout

- `index.ts` — server plugin: the `permission.evaluate` hook, policy assembly, decision recording, RPC handlers.
- `tui.tsx` — TUI plugin: composer badge, `/auto-approve` commands, decision panel, toasts.
- `rpc.ts` — the shared RPC contract (JSON Schema) used by both halves.
- `build.mjs` — Solid universal bundle for the TUI half (host UI modules stay external).
- `dist/tui.js` — checked-in bundle used by installed packages.
- `.typecheck/` — typecheck harness (paths to Solid/OpenTUI types without putting them in the runtime package).
