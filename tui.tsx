/**
 * auto-approve TUI surfaces.
 *
 * - prompt.footer badge: `⏵⏵ auto-approve · <judge>` when on, briefly
 *   flashing each verdict for the current session, `auto-approve off` when off
 * - `/auto-approve` slash command (aliases: /aa, /approval) for toggling and
 *   configuration
 * - toasts for blocks, escalations, and fail-closed decisions
 * - `/auto-approve log` opens a session panel with the decision history
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
  const root = theme as { text?: Record<string, unknown>; hue?: Record<string, unknown> } | undefined
  const text = (root?.text ?? {}) as Record<string, unknown>
  const status = (text.status ?? {}) as Record<string, string | undefined>
  const hue = (root?.hue ?? {}) as Record<string, unknown>
  const green = (hue.green ?? {}) as Record<string, string | undefined>
  const accent = typeof hue.accent === "string" ? hue.accent : undefined
  return {
    default: typeof text.default === "string" ? text.default : undefined,
    subdued: typeof text.subdued === "string" ? text.subdued : undefined,
    success: green[400] ?? accent ?? status.running ?? (typeof text.success === "string" ? text.success : undefined),
    danger: typeof text.danger === "string" ? text.danger : undefined,
    warning: typeof text.warning === "string" ? text.warning : undefined,
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

    const [status, setStatus] = createSignal<StatusInfo | undefined>(undefined)
    const [flash, setFlash] = createSignal<DecisionRecord | undefined>(undefined)
    const [sessionID, setSessionID] = createSignal<string | undefined>(undefined)
    const [revision, setRevision] = createSignal(0)

    let flashTimer: ReturnType<typeof setTimeout> | undefined

    const toast = (message: string, variant: "info" | "success" | "warning" | "error" = "info"): void => {
      context.ui.toast.show({ title: "auto-approve", message, variant, duration: 5_000 })
    }

    const refreshStatus = async (): Promise<void> => {
      try {
        const result = asResult<StatusInfo>(await rpc.status({}))
        if (result !== undefined) setStatus(result)
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
      if (decision.verdict === "allow") return
      toast(
        `${VERDICT_ICON[decision.verdict] ?? "!"} ${decision.action} ${short(decision.resources.join(" "), 60)} — ${
          short(decision.reason, 120) || "blocked"
        }`,
        decision.verdict === "deny" ? "error" : "warning",
      )
    }

    const unsubscribeEvents = [
      rpc.events.on("decision", (event) => handleDecision(event.data as unknown as DecisionRecord)),
      rpc.events.on("config", () => void refreshStatus()),
    ]

    const toggle = async (target?: boolean): Promise<void> => {
      try {
        const result = asResult<{ enabled: boolean }>(await rpc.toggle(target === undefined ? {} : { enabled: target }))
        if (result === undefined) throw new Error("toggle returned an error")
        await refreshStatus()
        toast(result.enabled ? "on — every auto-approved tool call is judged first" : "off — permission rules only", result.enabled ? "success" : "info")
      } catch {
        toast("toggle failed — is the plugin loaded on the server?", "error")
      }
    }

    const setJudgeStage = async (stage: 1 | 2, providerID: string, modelID: string): Promise<void> => {
      const call = stage === 1 ? rpc.setJudge : rpc.setJudge2
      try {
        const result = asResult<{ providerID: string; id: string }>(await call({ providerID, id: modelID }))
        if (result === undefined) throw new Error("unknown model")
        await refreshStatus()
        toast(`stage-${stage} judge → ${result.providerID}/${result.id}`, "success")
      } catch (error) {
        toast(`set stage-${stage} judge failed — ${short(error instanceof Error ? error.message : String(error), 120)}`, "error")
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
        case "status": {
          const s = status()
          if (s === undefined) return toast("status unavailable — server plugin not reachable", "error")
          const judge = s.judge === null ? "default model" : shortModel(s.judge.id)
          const judge2 = s.judge2 === null ? "default model" : shortModel(s.judge2.id)
          return toast(
            `${s.enabled ? "on" : "off"} · judge ${judge} → ${judge2} · ${
              s.twoStage ? "two-stage" : "single-stage"
            } · subagents ${s.subagents} · escalate ${s.escalate.consecutive}/${s.escalate.total} · timeout ${(s.timeoutMs / 1000).toFixed(0)}s`,
            s.enabled ? "success" : "info",
          )
        }
        case "log":
          if (!context.ui.panel.open("auto-approve.log")) toast("open a session first — the log panel is per session", "warning")
          return
        case "clear": {
          try {
            await rpc.clear({})
            setRevision((value) => value + 1)
            return toast("decision log cleared", "success")
          } catch {
            return toast("clear failed", "error")
          }
        }
        case "judge":
        case "judge2": {
          const stage = command.toLowerCase() === "judge2" ? 2 : 1
          const value = argument.trim()
          const separator = value.indexOf("/")
          if (separator <= 0) return toast(`usage: /auto-approve ${command.toLowerCase()} <providerID>/<modelID>`, "warning")
          return void setJudgeStage(stage, value.slice(0, separator), value.slice(separator + 1))
        }
        default:
          return toast("usage: /auto-approve [on|off|status|log|clear|judge provider/model|judge2 provider/model]", "warning")
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

    const unsubscribeBadge = context.ui.slot({
      prepend: "prompt.footer",
      render: (input) => {
        if (input.sessionID !== undefined) setSessionID(input.sessionID)
        const c = colors()
        const f = flash()
        if (f !== undefined) {
          const allowed = f.verdict === "allow"
          const detail = allowed ? `${(f.latencyMs / 1000).toFixed(1)}s` : short(f.reason, 60) || f.verdict
          return (
            <text fg={allowed ? c.success : f.verdict === "deny" ? c.danger : c.warning}>
              {`${VERDICT_ICON[f.verdict] ?? "!"} auto-approve ${f.action} · ${detail}`}
            </text>
          )
        }
        const s = status()
        if (s === undefined) return <text fg={c.subdued}>auto-approve · offline</text>
        if (!s.enabled) return <text fg={c.subdued}>auto-approve off</text>
        return <text fg={c.success}>⏵⏵ auto-approve</text>
      },
    })

    const LogPanel = (props: { sessionID: string }) => {
      const [items, setItems] = createSignal<readonly DecisionRecord[]>([])
      const [error, setError] = createSignal<string | undefined>(undefined)

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
        commands: [
          {
            id: "auto-approve.panel.refresh",
            title: "Refresh decisions",
            bind: "r",
            run: () => void refresh(),
          },
        ],
      }))

      const line = (entry: DecisionRecord): string =>
        `${entry.time.slice(11, 19)} ${VERDICT_ICON[entry.verdict] ?? "!"} ${entry.verdict.padEnd(11)} ${entry.action} ${short(
          entry.resources.join(" "),
          48,
        )}${entry.reason === "" ? "" : ` — ${short(entry.reason, 90)}`}`

      const c = colors()
      return (
        <box>
          <text fg={c.subdued}>auto-approve decisions · r refresh · newest last</text>
          {error() !== undefined ? (
            <text fg={c.danger}>{error()}</text>
          ) : items().length === 0 ? (
            <text fg={c.subdued}>no decisions recorded yet</text>
          ) : (
            items()
              .slice()
              .reverse()
              .map((entry) => (
                <text
                  fg={entry.verdict === "allow" ? c.default : entry.verdict === "deny" ? c.danger : c.warning}
                >
                  {line(entry)}
                </text>
              ))
          )}
        </box>
      )
    }

    const unsubscribePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => (panel.name === "auto-approve.log" ? <LogPanel sessionID={panel.sessionID} /> : null),
    })

    return () => {
      clearTimeout(flashTimer)
      unsubscribeEvents.forEach((stop) => stop())
      unsubscribeKeymap()
      unsubscribeBadge()
      unsubscribePanel()
    }
  },
})
