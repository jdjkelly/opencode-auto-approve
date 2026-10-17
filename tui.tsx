/**
 * auto-approve TUI surfaces.
 *
 * - prompt.footer badge: `⏵⏵ auto-approve · <judge>` when on, briefly
 *   flashing each verdict for the current session, `auto-approve off` when off
 * - `/auto-approve` slash command (aliases: /aa, /approval) for toggling and
 *   configuration
 * - `/auto-approve log` opens a session panel with the decision history
 * - right sidebar section: on/off, judge model, per-session verdict counts, and
 *   the three most recent decisions, all for the current session
 *
 * All state flows from the server plugin over its RPC contract, so this file
 * holds no policy and persists nothing.
 */
/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { AutoApprove, type DecisionRecord, type StatusInfo } from "./rpc.js"
import { createEffect, createSignal } from "solid-js"

const VERDICT_ICON: Record<string, string> = {
  allow: "✓",
  deny: "✗",
  escalate: "!",
  "fail-closed": "!",
}

const short = (text: string, max: number): string => (text.length > max ? text.slice(0, max - 1) + "…" : text)

/** `accounts/fireworks/models/deepseek-v4p1-flash` → `deepseek-v4p1-flash`. */
const shortModel = (id: string): string => id.split("/").pop() ?? id

interface Colors {
  readonly default: string | undefined
  readonly subdued: string | undefined
  readonly success: string | undefined
  readonly danger: string | undefined
  readonly warning: string | undefined
}

/** Bright accent green when the theme exposes one, semantic tokens as fallback. */
const themeColors = (theme: unknown): Colors => {
  const root = theme as Record<string, unknown> | undefined
  const text = (root?.text ?? {}) as Record<string, unknown>
  const hue = (root?.hue ?? {}) as Record<string, unknown>
  const green = (hue.green ?? {}) as Record<string, unknown>
  const pick = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
  // Resolved themes differ between versions: some expose flat tokens
  // (`text`, `textMuted`, `success`, `error` …), others nest them under `text`
  // and `hue`. Probe both so the dim and status colors actually apply, and fall
  // back to a readable dark-theme palette if the theme has none of them.
  const flat = (name: string): string | undefined => pick(root?.[name])
  const nested = (name: string): string | undefined => pick(text[name])
  return {
    default: flat("text") ?? nested("default") ?? nested("text"),
    subdued: flat("textMuted") ?? flat("muted") ?? nested("muted") ?? nested("subdued") ?? nested("dim") ?? "#7f849c",
    success: flat("success") ?? nested("success") ?? pick(green[400]) ?? pick(hue.accent) ?? "#a6e3a1",
    danger: flat("error") ?? flat("danger") ?? nested("danger") ?? nested("error") ?? "#f38ba8",
    warning: flat("warning") ?? nested("warning") ?? "#f9e2af",
  }
}

/** Narrows an RPC result, treating error-shaped responses as failures. */
const asResult = <T,>(value: unknown): T | undefined =>
  typeof value === "object" && value !== null && !("error" in value) ? (value as T) : undefined

export default Plugin.define({
  id: "auto-approve",
  async setup(context) {
    const rpc = context.client.rpc(AutoApprove)
    const colors = () => themeColors(context.theme)

    const [statuses, setStatuses] = createSignal(new Map<string | undefined, StatusInfo>())
    const statusFor = (sessionID: string | undefined): StatusInfo | undefined => statuses().get(sessionID)
    const [flash, setFlash] = createSignal<DecisionRecord | undefined>(undefined)
    const [sessionID, setSessionID] = createSignal<string | undefined>(undefined)
    const [revision, setRevision] = createSignal(0)
    // Periodic refresh so per-session status recovers if the first fetch raced
    // the server plugin's startup.
    const [tick, setTick] = createSignal(0)
    const tickTimer = setInterval(() => setTick((value) => value + 1), 5_000)

    let flashTimer: ReturnType<typeof setTimeout> | undefined

    const refreshStatus = async (sessionID?: string): Promise<void> => {
      try {
        const result = asResult<StatusInfo>(await rpc.status({ sessionID }))
        if (result !== undefined) {
          setStatuses((previous) => {
            const next = new Map(previous)
            next.set(sessionID, result)
            return next
          })
        }
      } catch {
        // The server plugin is not reachable; the badge shows the offline state.
      }
    }
    void refreshStatus()

    const showFlash = (decision: DecisionRecord): void => {
      setFlash(decision)
      clearTimeout(flashTimer)
      flashTimer = setTimeout(() => setFlash(undefined), 8_000)
    }

    const handleDecision = (decision: DecisionRecord): void => {
      setRevision((value) => value + 1)
      const current = sessionID()
      if (current !== undefined && decision.sessionID !== current) return
      showFlash(decision)
    }

    const unsubscribeEvents = [
      rpc.events.on("decision", (event) => handleDecision(event.data as unknown as DecisionRecord)),
      rpc.events.on("config", (event) => {
        const data = event.data as { enabled: boolean; sessionID?: string }
        void refreshStatus(data.sessionID)
        const current = sessionID()
        if (current !== undefined) void refreshStatus(current)
      }),
    ]

    const toggle = async (target?: boolean): Promise<void> => {
      const current = sessionID()
      try {
        const result = asResult<{ enabled: boolean }>(await rpc.toggle({ enabled: target, sessionID: current }))
        if (result === undefined) return
        await refreshStatus(current)
      } catch {
        // The badge reflects the current state after the next refresh; no popup.
      }
    }

    const setJudgeStage = async (stage: 1 | 2, providerID: string, modelID: string): Promise<void> => {
      const call = stage === 1 ? rpc.setJudge : rpc.setJudge2
      try {
        const result = asResult<{ providerID: string; id: string }>(await call({ providerID, id: modelID }))
        if (result === undefined) return
        await refreshStatus()
      } catch {
        // The status shown in the badge/sidebar is unchanged; no popup.
      }
    }

    const runCommand = async (input: string): Promise<void> => {
      const args = input.trim()
      if (args === "") return void toggle()
      const [command, ...rest] = args.split(/\s+/)
      const argument = rest.join(" ")
      switch (command?.toLowerCase()) {
        case "on":
          return void toggle(true)
        case "off":
          return void toggle(false)
        case "status":
          // The badge and sidebar already show the current state; nothing to pop up.
          return
        case "log":
          context.ui.panel.open("auto-approve.log")
          return
        case "clear": {
          try {
            await rpc.clear({})
            setRevision((value) => value + 1)
          } catch {
            // ignored
          }
          return
        }
        case "model":
        case "model2": {
          const stage = command.toLowerCase() === "model2" ? 2 : 1
          const value = argument.trim()
          if (stage === 1 && value === "") {
            return void pickJudge()
          }
          const separator = value.indexOf("/")
          if (separator <= 0) return
          return void setJudgeStage(stage, value.slice(0, separator), value.slice(separator + 1))
        }
        default:
          return
      }
    }

    // Keymap layers need the host's Keymap.Provider, which only exists inside
    // the render tree — register the command layer from an invisible app slot
    // instead of at setup time.
    const unsubscribeKeymap = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [
            {
              id: "auto-approve.command",
              title: "Auto-approve: toggle / configure the permission classifier",
              group: "Auto-approve",
              slash: { name: "auto-approve", aliases: ["aa", "approval"], arguments: true },
              palette: true,
              suggested: true,
              enabled: () => true,
              run: (input) => void runCommand(input ?? ""),
            },
          ],
        }))
        return null
      },
    })

    let lastStatusSession: string | undefined
    let lastStatusAttempt = 0
    const unsubscribeBadge = context.ui.slot({
      prepend: "prompt.footer",
      render: (input) => {
        tick()
        if (input.sessionID !== undefined) {
          setSessionID(input.sessionID)
          const known = statusFor(input.sessionID) !== undefined
          const now = Date.now()
          if (!known && (input.sessionID !== lastStatusSession || now - lastStatusAttempt > 4_000)) {
            lastStatusSession = input.sessionID
            lastStatusAttempt = now
            void refreshStatus(input.sessionID)
          }
        }
        const c = colors()
        const f = flash()
        if (f !== undefined) {
          const allowed = f.verdict === "allow"
          return (
            <box onMouseDown={() => void toggle()}>
              <text fg={allowed ? c.success : f.verdict === "deny" ? c.danger : c.warning}>
                {`${VERDICT_ICON[f.verdict] ?? "!"} auto-approve ${f.action}${allowed ? ` · ${(f.latencyMs / 1000).toFixed(1)}s` : ""}`}
              </text>
            </box>
          )
        }
        const s = statusFor(input.sessionID)
        const enabled = s?.enabled ?? true
        return (
          <box onMouseDown={() => void toggle()}>
            <text fg={enabled ? c.success : c.default}>{`${enabled ? "[✓]" : "[ ]"} auto-approve`}</text>
          </box>
        )
      },
    })

    const LogPanel = (props: { sessionID: string; width: number; onClose: () => void }) => {
      const [items, setItems] = createSignal<readonly DecisionRecord[]>([])
      const [error, setError] = createSignal<string | undefined>(undefined)
      let scrollRef: { scrollBy?: (amount: number) => void } | undefined

      const refresh = async (): Promise<void> => {
        try {
          const result = asResult<{ decisions: readonly DecisionRecord[] }>(
            await rpc.decisions({ sessionID: props.sessionID, limit: 200 }),
          )
          if (result === undefined) {
            setError("decision log unavailable — server plugin not reachable")
            return
          }
          setError(undefined)
          setItems(result.decisions)
        } catch {
          setError("decision log unavailable — server plugin not reachable")
        }
      }

      createEffect(() => {
        revision()
        void refresh()
      })

      context.keymap.layer(() => ({
        mode: "global",
        commands: [
          {
            id: "auto-approve.panel.refresh",
            title: "Refresh decisions",
            bind: "r",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => void refresh(),
          },
          {
            id: "auto-approve.panel.up",
            title: "Scroll up",
            bind: "up",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(-1),
          },
          {
            id: "auto-approve.panel.down",
            title: "Scroll down",
            bind: "down",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(1),
          },
          {
            id: "auto-approve.panel.up.k",
            title: "Scroll up (k)",
            bind: "k",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(-1),
          },
          {
            id: "auto-approve.panel.down.j",
            title: "Scroll down (j)",
            bind: "j",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(1),
          },
          {
            id: "auto-approve.panel.pgup",
            title: "Page up",
            bind: "pageup",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(-10),
          },
          {
            id: "auto-approve.panel.pgdown",
            title: "Page down",
            bind: "pagedown",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => scrollRef?.scrollBy?.(10),
          },
          {
            id: "auto-approve.panel.close",
            title: "Close auto-approve panel",
            bind: "escape",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => props.onClose(),
          },
          {
            id: "auto-approve.panel.close.q",
            title: "Close auto-approve panel (q)",
            bind: "q",
            enabled: () => context.ui.panel.current() !== undefined,
            run: () => props.onClose(),
          },
        ],
      }))

      const width = Math.max(24, props.width ?? 80)

      const row = (entry: DecisionRecord): string =>
        short(
          `${entry.time.slice(11, 19)}  ${VERDICT_ICON[entry.verdict] ?? "!"} ${entry.verdict.padEnd(11)} ${
            entry.action
          }  ${entry.resources.join(" ")}`,
          width,
        )

      const detail = (entry: DecisionRecord): string =>
        entry.reason === "" ? "" : `    ${short(entry.reason, Math.max(12, width - 5))}`

      const ordered = (): readonly DecisionRecord[] => items().slice().reverse()

      const c = colors()
      return (
        <box flexGrow={1} flexDirection="column">
          <text fg={c.subdued}>
            {short("auto-approve · ↑↓/jk scroll · pgup/pgdn · r refresh · q close", width)}
          </text>
          {error() !== undefined ? (
            <text fg={c.danger}>{short(error() ?? "", width)}</text>
          ) : items().length === 0 ? (
            <text fg={c.subdued}>no decisions recorded yet</text>
          ) : (
            <scrollbox
              ref={(element: unknown) => {
                scrollRef = element as { scrollBy?: (amount: number) => void }
              }}
              flexGrow={1}
              scrollY={true}
              stickyScroll={true}
              stickyStart="top"
            >
              {ordered().map((entry) => (
                <box>
                  <text fg={entry.verdict === "allow" ? c.default : entry.verdict === "deny" ? c.danger : c.warning}>
                    {row(entry)}
                  </text>
                  {entry.verdict === "allow" ? null : (
                    <text fg={entry.verdict === "deny" ? c.danger : c.warning}>{detail(entry)}</text>
                  )}
                </box>
              ))}
            </scrollbox>
          )}
        </box>
      )
    }

    const modelOptions = (): Array<{ title: string; value: string; category: string }> =>
      (context.data.location?.model?.list?.() ?? [])
        .map((model) => ({
          title: `${model.providerID}/${model.modelID}`,
          value: `${model.providerID}/${model.modelID}`,
          category: model.providerID,
        }))
        .sort((a, b) => a.title.localeCompare(b.title))

    /** Native select dialog: choose "auto" (follow the session) or pin a judge model. */
    const pickJudge = async (): Promise<void> => {
      const current = sessionID()
      const s = statusFor(current)
      const pinned =
        s !== undefined && s.judgeAuto === false && s.judge !== null ? `${s.judge.providerID}/${s.judge.id}` : "auto"
      try {
        const choice = await context.ui.dialog.select<string>({
          title: "auto-approve · judge model",
          placeholder: "auto, or type to pick a model",
          current: pinned,
          options: [
            {
              title: "auto — follow the session model",
              value: "auto",
              description: "judge with whatever model this conversation is using",
            },
            ...modelOptions(),
          ],
        })
        if (choice === undefined) return
        if (choice === "auto") {
          await rpc.clearJudge({})
        } else {
          const separator = choice.indexOf("/")
          if (separator <= 0) return
          await rpc.setJudge({ providerID: choice.slice(0, separator), id: choice.slice(separator + 1) })
        }
        await refreshStatus(current)
      } catch {
        // dialog dismissed or server unreachable; nothing to do
      }
    }

    const unsubscribePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) =>
        panel.name === "auto-approve.log"
          ? <LogPanel sessionID={panel.sessionID} width={panel.width} onClose={panel.close} />
          : null,
    })

    // Floating close button. The session.panel slot does not receive mouse
    // events, so the button lives in the global `app` slot (rendered last, on
    // top) and only when this plugin's panel is open.
    const unsubscribeFloatingClose = context.ui.slot({
      append: "app",
      render: () => {
        if (context.ui.panel.current() === undefined) return null
        return (
          <box position="absolute" top={0} right={0}>
            <box onMouseDown={() => context.ui.panel.close()}>
              <text fg={colors().danger}>[✕ close]</text>
            </box>
          </box>
        )
      },
    })

    const SidebarInfo = (props: { sessionID: string }) => {
      createEffect(() => {
        tick()
        void refreshStatus(props.sessionID)
      })

      const judge = (): string => {
        // Show the effective judge (resolved by the server), so pinning a model
        // through the picker updates this line. Falls back to the session model.
        const resolved = statusFor(props.sessionID)?.judge
        if (resolved !== null && resolved !== undefined) return shortModel(resolved.id)
        const model = context.data.session.get(props.sessionID)?.model
        return model === undefined ? "session model" : shortModel(model.id)
      }

      const c = colors()
      return (
        <box>
          <text fg={c.default}>auto-approve</text>
          <text fg={c.subdued}>{judge()}</text>
        </box>
      )
    }

    const unsubscribeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (input) => <SidebarInfo sessionID={input.sessionID} />,
    })

    return () => {
      clearTimeout(flashTimer)
      clearInterval(tickTimer)
      unsubscribeEvents.forEach((stop) => stop())
      unsubscribeKeymap()
      unsubscribeBadge()
      unsubscribePanel()
      unsubscribeFloatingClose()
      unsubscribeSidebar()
    }
  },
})
