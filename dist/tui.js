// tui.tsx
import { createComponent as _$createComponent } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
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
var statusInput = {
  type: "object",
  properties: {
    // Optional: when present, `enabled` reflects that session's override
    // (per-session switch) instead of the global default.
    sessionID: { type: "string" }
  },
  additionalProperties: false
};
var statusOutput = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    judgeAuto: { type: "boolean" },
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
  required: ["enabled", "judgeAuto", "judge", "judge2", "twoStage", "subagents", "escalate", "timeoutMs", "skipActions"],
  additionalProperties: false
};
var toggleInput = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    // When present, toggles only this session instead of the global default.
    sessionID: { type: "string" }
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
    sessionID: { type: "string" },
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
      input: statusInput,
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
    clearJudge: {
      input: emptyObject,
      output: emptyObject
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
  const hue = root?.hue ?? {};
  const green = hue.green ?? {};
  const pick = (value) => typeof value === "string" ? value : void 0;
  const flat = (name) => pick(root?.[name]);
  const nested = (name) => pick(text[name]);
  return {
    default: flat("text") ?? nested("default") ?? nested("text"),
    subdued: flat("textMuted") ?? flat("muted") ?? nested("muted") ?? nested("subdued") ?? nested("dim") ?? "#7f849c",
    success: flat("success") ?? nested("success") ?? pick(green[400]) ?? pick(hue.accent) ?? "#a6e3a1",
    danger: flat("error") ?? flat("danger") ?? nested("danger") ?? nested("error") ?? "#f38ba8",
    warning: flat("warning") ?? nested("warning") ?? "#f9e2af"
  };
};
var asResult = (value) => typeof value === "object" && value !== null && !("error" in value) ? value : void 0;
var tui_default = Plugin.define({
  id: "auto-approve",
  async setup(context) {
    const rpc = context.client.rpc(AutoApprove);
    const colors = () => themeColors(context.theme);
    const [statuses, setStatuses] = createSignal(/* @__PURE__ */ new Map());
    const statusFor = (sessionID2) => statuses().get(sessionID2);
    const [flash, setFlash] = createSignal(void 0);
    const [sessionID, setSessionID] = createSignal(void 0);
    const [revision, setRevision] = createSignal(0);
    const [tick, setTick] = createSignal(0);
    const tickTimer = setInterval(() => setTick((value) => value + 1), 5e3);
    let flashTimer;
    const refreshStatus = async (sessionID2) => {
      try {
        const result = asResult(await rpc.status({
          sessionID: sessionID2
        }));
        if (result !== void 0) {
          setStatuses((previous) => {
            const next = new Map(previous);
            next.set(sessionID2, result);
            return next;
          });
        }
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
    };
    const unsubscribeEvents = [rpc.events.on("decision", (event) => handleDecision(event.data)), rpc.events.on("config", (event) => {
      const data = event.data;
      void refreshStatus(data.sessionID);
      const current = sessionID();
      if (current !== void 0) void refreshStatus(current);
    })];
    const toggle = async (target) => {
      const current = sessionID();
      try {
        const result = asResult(await rpc.toggle({
          enabled: target,
          sessionID: current
        }));
        if (result === void 0) return;
        await refreshStatus(current);
      } catch {
      }
    };
    const setJudgeStage = async (stage, providerID, modelID) => {
      const call = stage === 1 ? rpc.setJudge : rpc.setJudge2;
      try {
        const result = asResult(await call({
          providerID,
          id: modelID
        }));
        if (result === void 0) return;
        await refreshStatus();
      } catch {
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
        case "status":
          return;
        case "log":
          context.ui.panel.open("auto-approve.log");
          return;
        case "clear": {
          try {
            await rpc.clear({});
            setRevision((value) => value + 1);
          } catch {
          }
          return;
        }
        case "model":
        case "model2": {
          const stage = command.toLowerCase() === "model2" ? 2 : 1;
          const value = argument.trim();
          if (stage === 1 && value === "") {
            return void pickJudge();
          }
          const separator = value.indexOf("/");
          if (separator <= 0) return;
          return void setJudgeStage(stage, value.slice(0, separator), value.slice(separator + 1));
        }
        default:
          return;
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
    let lastStatusSession;
    let lastStatusAttempt = 0;
    const unsubscribeBadge = context.ui.slot({
      prepend: "prompt.footer",
      render: (input) => {
        tick();
        if (input.sessionID !== void 0) {
          setSessionID(input.sessionID);
          const known = statusFor(input.sessionID) !== void 0;
          const now = Date.now();
          if (!known && (input.sessionID !== lastStatusSession || now - lastStatusAttempt > 4e3)) {
            lastStatusSession = input.sessionID;
            lastStatusAttempt = now;
            void refreshStatus(input.sessionID);
          }
        }
        const c = colors();
        const f = flash();
        if (f !== void 0) {
          const allowed = f.verdict === "allow";
          return (() => {
            var _el$ = _$createElement("box"), _el$2 = _$createElement("text");
            _$insertNode(_el$, _el$2);
            _$setProp(_el$, "onMouseDown", () => void toggle());
            _$insert(_el$2, () => `${VERDICT_ICON[f.verdict] ?? "!"} auto-approve ${f.action}${allowed ? ` \xB7 ${(f.latencyMs / 1e3).toFixed(1)}s` : ""}`);
            _$effect((_$p) => _$setProp(_el$2, "fg", allowed ? c.success : f.verdict === "deny" ? c.danger : c.warning, _$p));
            return _el$;
          })();
        }
        const s = statusFor(input.sessionID);
        const enabled = s?.enabled ?? true;
        return (() => {
          var _el$3 = _$createElement("box"), _el$4 = _$createElement("text");
          _$insertNode(_el$3, _el$4);
          _$setProp(_el$3, "onMouseDown", () => void toggle());
          _$insert(_el$4, `${enabled ? "[\u2713]" : "[ ]"} auto-approve`);
          _$effect((_$p) => _$setProp(_el$4, "fg", enabled ? c.success : c.default, _$p));
          return _el$3;
        })();
      }
    });
    const LogPanel = (props) => {
      const [items, setItems] = createSignal([]);
      const [error, setError] = createSignal(void 0);
      let scrollRef;
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
        mode: "global",
        commands: [{
          id: "auto-approve.panel.refresh",
          title: "Refresh decisions",
          bind: "r",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => void refresh()
        }, {
          id: "auto-approve.panel.up",
          title: "Scroll up",
          bind: "up",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(-1)
        }, {
          id: "auto-approve.panel.down",
          title: "Scroll down",
          bind: "down",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(1)
        }, {
          id: "auto-approve.panel.up.k",
          title: "Scroll up (k)",
          bind: "k",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(-1)
        }, {
          id: "auto-approve.panel.down.j",
          title: "Scroll down (j)",
          bind: "j",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(1)
        }, {
          id: "auto-approve.panel.pgup",
          title: "Page up",
          bind: "pageup",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(-10)
        }, {
          id: "auto-approve.panel.pgdown",
          title: "Page down",
          bind: "pagedown",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => scrollRef?.scrollBy?.(10)
        }, {
          id: "auto-approve.panel.close",
          title: "Close auto-approve panel",
          bind: "escape",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => props.onClose()
        }, {
          id: "auto-approve.panel.close.q",
          title: "Close auto-approve panel (q)",
          bind: "q",
          enabled: () => context.ui.panel.current() !== void 0,
          run: () => props.onClose()
        }]
      }));
      const width = Math.max(24, props.width ?? 80);
      const row = (entry) => short(`${entry.time.slice(11, 19)}  ${VERDICT_ICON[entry.verdict] ?? "!"} ${entry.verdict.padEnd(11)} ${entry.action}  ${entry.resources.join(" ")}`, width);
      const detail = (entry) => entry.reason === "" ? "" : `    ${short(entry.reason, Math.max(12, width - 5))}`;
      const ordered = () => items().slice().reverse();
      const c = colors();
      return (() => {
        var _el$5 = _$createElement("box"), _el$6 = _$createElement("text");
        _$insertNode(_el$5, _el$6);
        _$setProp(_el$5, "flexGrow", 1);
        _$setProp(_el$5, "flexDirection", "column");
        _$insert(_el$6, () => short("auto-approve \xB7 \u2191\u2193/jk scroll \xB7 pgup/pgdn \xB7 r refresh \xB7 q close", width));
        _$insert(_el$5, (() => {
          var _c$ = _$memo(() => error() !== void 0);
          return () => _c$() ? (() => {
            var _el$7 = _$createElement("text");
            _$insert(_el$7, () => short(error() ?? "", width));
            _$effect((_$p) => _$setProp(_el$7, "fg", c.danger, _$p));
            return _el$7;
          })() : _$memo(() => items().length === 0)() ? (() => {
            var _el$8 = _$createElement("text");
            _$insertNode(_el$8, _$createTextNode(`no decisions recorded yet`));
            _$effect((_$p) => _$setProp(_el$8, "fg", c.subdued, _$p));
            return _el$8;
          })() : (() => {
            var _el$0 = _$createElement("scrollbox");
            _$use((element) => {
              scrollRef = element;
            }, _el$0);
            _$setProp(_el$0, "flexGrow", 1);
            _$setProp(_el$0, "scrollY", true);
            _$setProp(_el$0, "stickyScroll", true);
            _$setProp(_el$0, "stickyStart", "top");
            _$insert(_el$0, () => ordered().map((entry) => (() => {
              var _el$1 = _$createElement("box"), _el$10 = _$createElement("text");
              _$insertNode(_el$1, _el$10);
              _$insert(_el$10, () => row(entry));
              _$insert(_el$1, (() => {
                var _c$2 = _$memo(() => entry.verdict === "allow");
                return () => _c$2() ? null : (() => {
                  var _el$11 = _$createElement("text");
                  _$insert(_el$11, () => detail(entry));
                  _$effect((_$p) => _$setProp(_el$11, "fg", entry.verdict === "deny" ? c.danger : c.warning, _$p));
                  return _el$11;
                })();
              })(), null);
              _$effect((_$p) => _$setProp(_el$10, "fg", entry.verdict === "allow" ? c.default : entry.verdict === "deny" ? c.danger : c.warning, _$p));
              return _el$1;
            })()));
            return _el$0;
          })();
        })(), null);
        _$effect((_$p) => _$setProp(_el$6, "fg", c.subdued, _$p));
        return _el$5;
      })();
    };
    const modelOptions = () => (context.data.location?.model?.list?.() ?? []).map((model) => ({
      title: `${model.providerID}/${model.modelID}`,
      value: `${model.providerID}/${model.modelID}`,
      category: model.providerID
    })).sort((a, b) => a.title.localeCompare(b.title));
    const pickJudge = async () => {
      const current = sessionID();
      const s = statusFor(current);
      const pinned = s !== void 0 && s.judgeAuto === false && s.judge !== null ? `${s.judge.providerID}/${s.judge.id}` : "auto";
      try {
        const choice = await context.ui.dialog.select({
          title: "auto-approve \xB7 judge model",
          placeholder: "auto, or type to pick a model",
          current: pinned,
          options: [{
            title: "auto \u2014 follow the session model",
            value: "auto",
            description: "judge with whatever model this conversation is using"
          }, ...modelOptions()]
        });
        if (choice === void 0) return;
        if (choice === "auto") {
          await rpc.clearJudge({});
        } else {
          const separator = choice.indexOf("/");
          if (separator <= 0) return;
          await rpc.setJudge({
            providerID: choice.slice(0, separator),
            id: choice.slice(separator + 1)
          });
        }
        await refreshStatus(current);
      } catch {
      }
    };
    const unsubscribePanel = context.ui.slot({
      append: "session.panel",
      render: (panel) => panel.name === "auto-approve.log" ? _$createComponent(LogPanel, {
        get sessionID() {
          return panel.sessionID;
        },
        get width() {
          return panel.width;
        },
        get onClose() {
          return panel.close;
        }
      }) : null
    });
    const unsubscribeFloatingClose = context.ui.slot({
      append: "app",
      render: () => {
        if (context.ui.panel.current() === void 0) return null;
        return (() => {
          var _el$12 = _$createElement("box"), _el$13 = _$createElement("box"), _el$14 = _$createElement("text");
          _$insertNode(_el$12, _el$13);
          _$setProp(_el$12, "position", "absolute");
          _$setProp(_el$12, "top", 0);
          _$setProp(_el$12, "right", 0);
          _$insertNode(_el$13, _el$14);
          _$setProp(_el$13, "onMouseDown", () => context.ui.panel.close());
          _$insertNode(_el$14, _$createTextNode(`[\u2715 close]`));
          _$effect((_$p) => _$setProp(_el$14, "fg", colors().danger, _$p));
          return _el$12;
        })();
      }
    });
    const SidebarInfo = (props) => {
      createEffect(() => {
        tick();
        void refreshStatus(props.sessionID);
      });
      const judge = () => {
        const resolved = statusFor(props.sessionID)?.judge;
        if (resolved !== null && resolved !== void 0) return shortModel(resolved.id);
        const model = context.data.session.get(props.sessionID)?.model;
        return model === void 0 ? "session model" : shortModel(model.id);
      };
      const c = colors();
      return (() => {
        var _el$16 = _$createElement("box"), _el$17 = _$createElement("text"), _el$19 = _$createElement("text");
        _$insertNode(_el$16, _el$17);
        _$insertNode(_el$16, _el$19);
        _$insertNode(_el$17, _$createTextNode(`auto-approve`));
        _$insert(_el$19, judge);
        _$effect((_p$) => {
          var _v$ = c.default, _v$2 = c.subdued;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$17, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$19, "fg", _v$2, _p$.t));
          return _p$;
        }, {
          e: void 0,
          t: void 0
        });
        return _el$16;
      })();
    };
    const unsubscribeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: (input) => _$createComponent(SidebarInfo, {
        get sessionID() {
          return input.sessionID;
        }
      })
    });
    return () => {
      clearTimeout(flashTimer);
      clearInterval(tickTimer);
      unsubscribeEvents.forEach((stop) => stop());
      unsubscribeKeymap();
      unsubscribeBadge();
      unsubscribePanel();
      unsubscribeFloatingClose();
      unsubscribeSidebar();
    };
  }
});
export {
  tui_default as default
};
