// tui.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { Plugin } from "@opencode/plugin/tui";

// rpc.ts
import { Rpc } from "@opencode/plugin/rpc";
var modelRef = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    id: { type: "string" }
  },
  required: ["providerID", "id"],
  additionalProperties: false
};
var decision = {
  type: "object",
  properties: {
    time: { type: "string" },
    sessionID: { type: "string" },
    action: { type: "string" },
    resources: { type: "array", items: { type: "string" } },
    verdict: { type: "string", enum: ["allow", "deny", "escalate", "fail-closed"] },
    reason: { type: "string" },
    latencyMs: { type: "number" }
  },
  required: ["time", "sessionID", "action", "resources", "verdict", "reason", "latencyMs"],
  additionalProperties: false
};
var emptyObject = {
  type: "object",
  additionalProperties: false
};
var statusOutput = {
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
        total: { type: "number" }
      },
      required: ["consecutive", "total"],
      additionalProperties: false
    },
    timeoutMs: { type: "number" },
    skipActions: { type: "array", items: { type: "string" } }
  },
  required: ["enabled", "judge", "judge2", "twoStage", "subagents", "escalate", "timeoutMs", "skipActions"],
  additionalProperties: false
};
var toggleInput = {
  type: "object",
  properties: {
    enabled: { type: "boolean" }
  },
  additionalProperties: false
};
var toggleOutput = {
  type: "object",
  properties: {
    enabled: { type: "boolean" }
  },
  required: ["enabled"],
  additionalProperties: false
};
var decisionsInput = {
  type: "object",
  properties: {
    sessionID: { type: "string" },
    limit: { type: "number" }
  },
  additionalProperties: false
};
var decisionsOutput = {
  type: "object",
  properties: {
    decisions: { type: "array", items: decision }
  },
  required: ["decisions"],
  additionalProperties: false
};
var clearInput = {
  type: "object",
  properties: {
    sessionID: { type: "string" }
  },
  additionalProperties: false
};
var clearOutput = {
  type: "object",
  properties: {
    cleared: { type: "number" }
  },
  required: ["cleared"],
  additionalProperties: false
};
var configEvent = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    judge: modelRef,
    judge2: modelRef
  },
  required: ["enabled"],
  additionalProperties: false
};
var AutoApprove = Rpc.define({
  id: "auto-approve",
  methods: {
    status: {
      input: emptyObject,
      output: statusOutput
    },
    toggle: {
      input: toggleInput,
      output: toggleOutput
    },
    setJudge: {
      input: modelRef,
      output: modelRef,
      errors: {
        invalid: emptyObject,
        unknown_model: emptyObject
      }
    },
    setJudge2: {
      input: modelRef,
      output: modelRef,
      errors: {
        invalid: emptyObject,
        unknown_model: emptyObject
      }
    },
    decisions: {
      input: decisionsInput,
      output: decisionsOutput
    },
    clear: {
      input: clearInput,
      output: clearOutput
    }
  },
  events: {
    decision: { schema: decision },
    config: { schema: configEvent }
  }
});

// tui.tsx
import { createEffect, createSignal } from "solid-js";
var VERDICT_ICON = {
  allow: "\u2713",
  deny: "\u2717",
  escalate: "!",
  "fail-closed": "!"
};
var short = (text, max) => text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
var shortModel = (id) => id.split("/").pop() ?? id;
var themeColors = (theme) => {
  const root = theme;
  const text = root?.text ?? {};
  const status = text.status ?? {};
  const hue = root?.hue ?? {};
  const green = hue.green ?? {};
  const accent = typeof hue.accent === "string" ? hue.accent : void 0;
  return {
    default: typeof text.default === "string" ? text.default : void 0,
    subdued: typeof text.subdued === "string" ? text.subdued : void 0,
    success: green[400] ?? accent ?? status.running ?? (typeof text.success === "string" ? text.success : void 0),
    danger: typeof text.danger === "string" ? text.danger : void 0,
    warning: typeof text.warning === "string" ? text.warning : void 0
  };
};
var asResult = (value) => typeof value === "object" && value !== null && !("error" in value) ? value : void 0;
var tui_default = Plugin.define({
  id: "auto-approve",
  async setup(context) {
    const rpc = context.client.rpc(AutoApprove);
    const colors = () => themeColors(context.theme);
    const [status, setStatus] = createSignal(void 0);
    const [flash, setFlash] = createSignal(void 0);
    const [sessionID, setSessionID] = createSignal(void 0);
    const [revision, setRevision] = createSignal(0);
    let flashTimer;
    const toast = (message, variant = "info") => {
      context.ui.toast.show({
        title: "auto-approve",
        message,
        variant,
        duration: 5e3
      });
    };
    const refreshStatus = async () => {
      try {
        const result = asResult(await rpc.status({}));
        if (result !== void 0) setStatus(result);
      } catch {
      }
    };
    void refreshStatus();
    const showFlash = (decision2) => {
      setFlash(decision2);
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => setFlash(void 0), 8e3);
    };
    const handleDecision = (decision2) => {
      setRevision((value) => value + 1);
      const current = sessionID();
      if (current !== void 0 && decision2.sessionID !== current) return;
      showFlash(decision2);
      if (decision2.verdict === "allow") return;
      toast(`${VERDICT_ICON[decision2.verdict] ?? "!"} ${decision2.action} ${short(decision2.resources.join(" "), 60)} \u2014 ${short(decision2.reason, 120) || "blocked"}`, decision2.verdict === "deny" ? "error" : "warning");
    };
    const unsubscribeEvents = [rpc.events.on("decision", (event) => handleDecision(event.data)), rpc.events.on("config", () => void refreshStatus())];
    const toggle = async (target) => {
      try {
        const result = asResult(await rpc.toggle(target === void 0 ? {} : {
          enabled: target
        }));
        if (result === void 0) throw new Error("toggle returned an error");
        await refreshStatus();
        toast(result.enabled ? "on \u2014 every auto-approved tool call is judged first" : "off \u2014 permission rules only", result.enabled ? "success" : "info");
      } catch {
        toast("toggle failed \u2014 is the plugin loaded on the server?", "error");
      }
    };
    const setJudgeStage = async (stage, providerID, modelID) => {
      const call = stage === 1 ? rpc.setJudge : rpc.setJudge2;
      try {
        const result = asResult(await call({
          providerID,
          id: modelID
        }));
        if (result === void 0) throw new Error("unknown model");
        await refreshStatus();
        toast(`stage-${stage} judge \u2192 ${result.providerID}/${result.id}`, "success");
      } catch (error) {
        toast(`set stage-${stage} judge failed \u2014 ${short(error instanceof Error ? error.message : String(error), 120)}`, "error");
      }
    };
    const runCommand = async (input) => {
      const args = input.trim();
      if (args === "") return void toggle();
      const [command, ...rest] = args.split(/\s+/);
      const argument = rest.join(" ");
      switch (command?.toLowerCase()) {
        case "on":
          return void toggle(true);
        case "off":
          return void toggle(false);
        case "status": {
          const s = status();
          if (s === void 0) return toast("status unavailable \u2014 server plugin not reachable", "error");
          const judge = s.judge === null ? "default model" : shortModel(s.judge.id);
          const judge2 = s.judge2 === null ? "default model" : shortModel(s.judge2.id);
          return toast(`${s.enabled ? "on" : "off"} \xB7 judge ${judge} \u2192 ${judge2} \xB7 ${s.twoStage ? "two-stage" : "single-stage"} \xB7 subagents ${s.subagents} \xB7 escalate ${s.escalate.consecutive}/${s.escalate.total} \xB7 timeout ${(s.timeoutMs / 1e3).toFixed(0)}s`, s.enabled ? "success" : "info");
        }
        case "log":
          if (!context.ui.panel.open("auto-approve.log")) toast("open a session first \u2014 the log panel is per session", "warning");
          return;
        case "clear": {
          try {
            await rpc.clear({});
            setRevision((value) => value + 1);
            return toast("decision log cleared", "success");
          } catch {
            return toast("clear failed", "error");
          }
        }
        case "judge":
        case "judge2": {
          const stage = command.toLowerCase() === "judge2" ? 2 : 1;
          const value = argument.trim();
          const separator = value.indexOf("/");
          if (separator <= 0) return toast(`usage: /auto-approve ${command.toLowerCase()} <providerID>/<modelID>`, "warning");
          return void setJudgeStage(stage, value.slice(0, separator), value.slice(separator + 1));
        }
        default:
          return toast("usage: /auto-approve [on|off|status|log|clear|judge provider/model|judge2 provider/model]", "warning");
      }
    };
    const unsubscribeKeymap = context.ui.slot({
      append: "app",
      render: () => {
        context.keymap.layer(() => ({
          mode: "global",
          priority: 10,
          commands: [{
            id: "auto-approve.command",
            title: "Auto-approve: toggle / configure the permission classifier",
            group: "Auto-approve",
            slash: {
              name: "auto-approve",
              aliases: ["aa", "approval"],
              arguments: true
            },
            palette: true,
            suggested: true,
            enabled: () => true,
            run: (input) => void runCommand(input ?? "")
          }]
        }));
        return null;
      }
    });
    const unsubscribeBadge = context.ui.slot({
      prepend: "prompt.footer",
      render: (input) => {
        if (input.sessionID !== void 0) setSessionID(input.sessionID);
        const c = colors();
        const f = flash();
        if (f !== void 0) {
          const allowed = f.verdict === "allow";
          const detail = allowed ? `${(f.latencyMs / 1e3).toFixed(1)}s` : short(f.reason, 60) || f.verdict;
          return (() => {
            var _el$ = _$createElement("text");
            _$insert(_el$, () => `${VERDICT_ICON[f.verdict] ?? "!"} auto-approve ${f.action} \xB7 ${detail}`);
            _$effect((_$p) => _$setProp(_el$, "fg", allowed ? c.success : f.verdict === "deny" ? c.danger : c.warning, _$p));
            return _el$;
          })();
        }
        const s = status();
        if (s === void 0) return (() => {
          var _el$2 = _$createElement("text");
          _$insertNode(_el$2, _$createTextNode(`auto-approve \xB7 offline`));
          _$effect((_$p) => _$setProp(_el$2, "fg", c.subdued, _$p));
          return _el$2;
        })();
        if (!s.enabled) return (() => {
          var _el$4 = _$createElement("text");
          _$insertNode(_el$4, _$createTextNode(`auto-approve off`));
          _$effect((_$p) => _$setProp(_el$4, "fg", c.subdued, _$p));
          return _el$4;
        })();
        return (() => {
          var _el$6 = _$createElement("text");
          _$insertNode(_el$6, _$createTextNode(`\u23F5\u23F5 auto-approve`));
          _$effect((_$p) => _$setProp(_el$6, "fg", c.success, _$p));
          return _el$6;
        })();
      }
    });
    const LogPanel = (props) => {
      const [items, setItems] = createSignal([]);
      const [error, setError] = createSignal(void 0);
      const refresh = async () => {
        try {
          const result = asResult(await rpc.decisions({
            sessionID: props.sessionID,
            limit: 200
          }));
          if (result === void 0) {
            setError("decision log unavailable \u2014 server plugin not reachable");
            return;
          }
          setError(void 0);
          setItems(result.decisions);
        } catch {
          setError("decision log unavailable \u2014 server plugin not reachable");
        }
      };
      createEffect(() => {
        revision();
        void refresh();
      });
      context.keymap.layer(() => ({
        commands: [{
          id: "auto-approve.panel.refresh",
          title: "Refresh decisions",
          bind: "r",
          run: () => void refresh()
        }]
      }));
      const line = (entry) => `${entry.time.slice(11, 19)} ${VERDICT_ICON[entry.verdict] ?? "!"} ${entry.verdict.padEnd(11)} ${entry.action} ${short(entry.resources.join(" "), 48)}${entry.reason === "" ? "" : ` \u2014 ${short(entry.reason, 90)}`}`;
      const c = colors();
      return (() => {
        var _el$8 = _$createElement("box"), _el$9 = _$createElement("text");
        _$insertNode(_el$8, _el$9);
        _$insertNode(_el$9, _$createTextNode(`auto-approve decisions \xB7 r refresh \xB7 newest last`));
        _$insert(_el$8, (() => {
          var _c$ = _$memo(() => error() !== void 0);
          return () => _c$() ? (() => {
            var _el$1 = _$createElement("text");
            _$insert(_el$1, error);
            _$effect((_$p) => _$setProp(_el$1, "fg", c.danger, _$p));
            return _el$1;
          })() : _$memo(() => items().length === 0)() ? (() => {
            var _el$10 = _$createElement("text");
            _$insertNode(_el$10, _$createTextNode(`no decisions recorded yet`));
            _$effect((_$p) => _$setProp(_el$10, "fg", c.subdued, _$p));
            return _el$10;
          })() : items().slice().reverse().map((entry) => (() => {
            var _el$12 = _$createElement("text");
            _$insert(_el$12, () => line(entry));
            _$effect((_$p) => _$setProp(_el$12, "fg", entry.verdict === "allow" ? c.default : entry.verdict === "deny" ? c.danger : c.warning, _$p));
            return _el$12;
          })());
        })(), null);
        _$effect((_$p) => _$setProp(_el$9, "fg", c.subdued, _$p));
        return _el$8;
      })();
    };
    const unsubscribePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => panel.name === "auto-approve.log" ? _$createComponent(LogPanel, {
        get sessionID() {
          return panel.sessionID;
        }
      }) : null
    });
    return () => {
      clearTimeout(flashTimer);
      unsubscribeEvents.forEach((stop) => stop());
      unsubscribeKeymap();
      unsubscribeBadge();
      unsubscribePanel();
    };
  }
});
export {
  tui_default as default
};
