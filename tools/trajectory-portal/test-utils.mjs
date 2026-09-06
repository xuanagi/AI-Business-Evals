import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

// Exercise the production translation table without bringing React or a DOM
// into this dependency-free utility harness. The pure locale section ends
// before the DOM observer and React provider declarations.
const i18nSource = await readFile(new URL("./src/i18n.tsx", import.meta.url), "utf8");
const pureI18nSource = i18nSource
  .replace(/^import .* from "react";\r?\n/, "")
  .split("type TextState =")[0];
const i18n = await import(`data:text/javascript;base64,${Buffer.from(transpile(pureI18nSource)).toString("base64")}`);
globalThis.__portalI18n = i18n;

const source = (await readFile(new URL("./src/utils.ts", import.meta.url), "utf8"))
  .replace('import { getLocale, tr } from "./i18n";\n', 'const { getLocale, tr } = globalThis.__portalI18n;\n');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { alignProcessEvents, formatDuration, messageText, processEvents, matchesModel, isHttpTrial } = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

assert.equal(i18n.tr("已完成", "en"), "Completed");
assert.equal(i18n.tr("查看 demo-job 的异常 Trial", "en"), "View failed Trials for demo-job");
assert.equal(i18n.trDom("已完成", "en"), "Completed");
assert.equal(i18n.trDom("failures=['DEC-044:已完成']", "en"), "failures=['DEC-044:已完成']");
i18n.setActiveLocale("en");
assert.equal(formatDuration(8.25), "8.3 sec");
assert.equal(messageText([{ type: "image", source: { path: "/workspace/chart.png" } }]), "[image: /workspace/chart.png]");
i18n.setActiveLocale("zh");

assert.equal(isHttpTrial({ agent: "http-json" }), true);
assert.equal(isHttpTrial({ agent: "harbor_agents.http_json:HttpJsonAgent" }), true);
assert.equal(isHttpTrial({ agentConfig: { import_path: "harbor_agents.http_json:HttpJsonAgent" } }), true);
assert.equal(isHttpTrial({ agent: "codex" }), false);

assert.equal(
  messageText([
    { type: "text", text: "查看数据" },
    { type: "image", source: { path: "/workspace/chart.png" } },
  ]),
  "查看数据\n[图片：/workspace/chart.png]",
);

const events = processEvents([
  {
    step_id: 1,
    source: "agent",
    message: [{ type: "text", text: "并行检查" }],
    tool_calls: [
      { tool_call_id: "ok", function_name: "exec", arguments: { cmd: "check-a" } },
      { tool_call_id: "failed", function_name: "exec", arguments: { cmd: "check-b" } },
      { tool_call_id: "missing", function_name: "exec", arguments: { cmd: "check-c" } },
    ],
    observation: {
      results: [
        { source_call_id: "ok", content: "ok" },
        { source_call_id: "failed", content: "command failed; exit code 1" },
      ],
    },
  },
]);

assert.deepEqual(events.map((event) => event.status), ["success", "failure", "unknown"]);
assert.deepEqual(events[0].observation.results, [{ source_call_id: "ok", content: "ok" }]);
assert.deepEqual(events[1].observation.results, [{ source_call_id: "failed", content: "command failed; exit code 1" }]);

const changed = processEvents([
  {
    step_id: 1,
    source: "agent",
    tool_calls: [{ tool_call_id: "ok", function_name: "exec", arguments: { cmd: "check-a" } }],
    observation: { results: [{ source_call_id: "ok", content: "different output" }] },
  },
]);
assert.equal(alignProcessEvents([events[0]], changed)[0].difference, "detail");

const equivalent = processEvents([{
  step_id: 7,
  source: "agent",
  tool_calls: [{ tool_call_id: "another-run-id", function_name: "exec", arguments: { cmd: "check-a" } }],
  observation: { results: [{ content: "ok", source_call_id: "another-run-id" }] },
}]);
assert.equal(alignProcessEvents([events[0]], equivalent)[0].difference, "same");
assert.equal(equivalent[0].observation.results[0].source_call_id, "another-run-id");

const reply = (suffix) => processEvents([{ step_id: 1, source: "agent", message: "a".repeat(600) + suffix }]);
assert.equal(alignProcessEvents(reply("left"), reply("right"))[0].difference, "detail");

const mixedTrials = [{ model: "A", reward: 1 }, { model: "B", reward: 0 }, { model: "", reward: 0.5 }];
assert.deepEqual(mixedTrials.filter((trial) => matchesModel(trial, "A")), [mixedTrials[0]]);
assert.deepEqual(mixedTrials.filter((trial) => matchesModel(trial, "__unknown__")), [mixedTrials[2]]);
assert.equal(mixedTrials.filter((trial) => matchesModel(trial, "")).length, 3);

console.log("trajectory utils tests passed");
