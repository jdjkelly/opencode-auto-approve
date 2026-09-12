/**
 * RPC contract shared by the server plugin (index.ts) and the TUI plugin
 * (tui.tsx).
 *
 * The TUI calls these methods for status, toggling, judge switching, and the
 * decision log, and subscribes to the `decision` and `config` events. Toggles
 * and judge switches take effect immediately: they rewrite the global options
 * file, and the server re-reads its options before every gated tool call.
 */
import { Rpc } from "@opencode/plugin/rpc"
import type { JsonSchema } from "effect"

/** A model reference in the form the AI SDK accepts. */
export type JudgeModelRef = {
  readonly providerID: string
  readonly id: string
}

/** Current effective options, as returned by `status`. */
export type StatusInfo = {
  readonly enabled: boolean
  readonly judge: JudgeModelRef | null
  readonly judge2: JudgeModelRef | null
  readonly twoStage: boolean
  readonly subagents: "ask" | "classify"
  readonly escalate: { readonly consecutive: number; readonly total: number }
  readonly timeoutMs: number
  readonly skipActions: ReadonlyArray<string>
}

/** One recorded classifier decision, returned by `decisions` and the `decision` event. */
export type DecisionRecord = {
  readonly time: string
  readonly sessionID: string
  readonly action: string
  readonly resources: ReadonlyArray<string>
  readonly verdict: "allow" | "deny" | "escalate" | "fail-closed"
  readonly reason: string
  readonly latencyMs: number
}

/** JSON Schemas are annotated so their `type` fields stay literal, which the RPC types require. */
type ObjectSchema = JsonSchema.JsonSchema & { readonly type: "object" }

const modelRef: ObjectSchema = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    id: { type: "string" },
  },
  required: ["providerID", "id"],
  additionalProperties: false,
}

const decision: ObjectSchema = {
  type: "object",
  properties: {
    time: { type: "string" },
    sessionID: { type: "string" },
    action: { type: "string" },
    resources: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["allow", "deny", "escalate", "fail-closed"] },
    reason: { type: "string" },
    latencyMs: { type: "number" },
  },
  required: ["time", "sessionID", "action", "resources", "verdict", "reason", "latencyMs"],
  additionalProperties: false,
}

const emptyObject: ObjectSchema = {
  type: "object",
  additionalProperties: false,
}

const statusOutput: ObjectSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    judge: { anyOf: [{ type: "null" }, modelRef] },
    judge2: { anyOf: [{ type: "null" }, modelRef] },
    twoStage: { type: "boolean" },
    subagents: { type: "string", enum: ["ask", "classify"] },
    escalate: {
      type: "object",
      properties: {
        consecutive: { type: "number" },
        total: { type: "number" },
      },
      required: ["consecutive", "total"],
      additionalProperties: false,
    },
    timeoutMs: { type: "number" },
    skipActions: { type: "array", items: { type: "string" } },
  },
  required: ["enabled", "judge", "judge2", "twoStage", "subagents", "escalate", "timeoutMs", "skipActions"],
  additionalProperties: false,
}

const toggleInput: ObjectSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
  },
  additionalProperties: false,
}

const toggleOutput: ObjectSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
  },
  required: ["enabled"],
  additionalProperties: false,
}

const decisionsInput: ObjectSchema = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    limit: { type: "number" },
  },
  additionalProperties: false,
}

const decisionsOutput: ObjectSchema = {
  type: "object",
  properties: {
    decisions: { type: "array", items: decision },
  },
  required: ["decisions"],
  additionalProperties: false,
}

const clearInput: ObjectSchema = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
  },
  additionalProperties: false,
}

const clearOutput: ObjectSchema = {
  type: "object",
  properties: {
    cleared: { type: "number" },
  },
  required: ["cleared"],
  additionalProperties: false,
}

const configEvent: ObjectSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    judge: modelRef,
    judge2: modelRef,
  },
  required: ["enabled"],
  additionalProperties: false,
}

export const AutoApprove = Rpc.define({
  id: "auto-approve",
  methods: {
    status: {
      input: emptyObject,
      output: statusOutput,
    },
    toggle: {
      input: toggleInput,
      output: toggleOutput,
    },
    setJudge: {
      input: modelRef,
      output: modelRef,
      errors: {
        invalid: emptyObject,
        unknown_model: emptyObject,
      },
    },
    setJudge2: {
      input: modelRef,
      output: modelRef,
      errors: {
        invalid: emptyObject,
        unknown_model: emptyObject,
      },
    },
    decisions: {
      input: decisionsInput,
      output: decisionsOutput,
    },
    clear: {
      input: clearInput,
      output: clearOutput,
    },
  },
  events: {
    decision: { schema: decision },
    config: { schema: configEvent },
  },
})
