#!/usr/bin/env bun

/**
 * Ralph Harness v2 — Autonomous task executor with tier-based evaluation.
 *
 * Usage: ralph-harness.js <project-path> <task-dir> [options]
 *
 * Options:
 *   --max-iterations N   Max loop iterations (default: 10)
 *   --container NAME     Run generator inside this Docker container
 *
 * Supports two task formats:
 *   - manifest.json + task-N/task.json  (v2, per-task directories with tiers)
 *   - tasks.json                        (v1 legacy, all tasks default to tier lite)
 *
 * Tier system:
 *   lite:        Generator → commit (identical to ralph v1)
 *   standard:    Generator → Evaluator → retry loop (max 2 retries)
 *   adversarial: Contract negotiation → Generator → Evaluator → retry loop (max 3)
 *
 * Exit codes:
 *   0 = All tasks done / PRD complete
 *   1 = Halted (evaluation retries exhausted) or error
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from "fs";
import { resolve, basename, dirname } from "path";

// ---------------------------------------------------------------------------
// Script directory — used to locate evaluator.js and contract-negotiation.js
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = dirname(new URL(import.meta.url).pathname);

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const flags = {};
const positional = [];

for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === "--container" && rawArgs[i + 1]) {
    flags.container = rawArgs[++i];
  } else if (rawArgs[i] === "--max-iterations" && rawArgs[i + 1]) {
    flags.maxIterations = parseInt(rawArgs[++i], 10);
  } else if (!rawArgs[i].startsWith("--")) {
    positional.push(rawArgs[i]);
  }
}

if (positional.length < 2) {
  console.log("Usage: ralph-harness.js <project-path> <task-dir> [options]");
  console.log("");
  console.log("  project-path       Path to the project root");
  console.log("  task-dir           Task directory name inside .local-development/");
  console.log("");
  console.log("Options:");
  console.log("  --max-iterations N   Max loop iterations (default: 10)");
  console.log("  --container NAME     Run generator inside this Docker container");
  process.exit(1);
}

const PROJECT_PATH = resolve(positional[0]);
const TASK_DIR = positional[1];
const MAX_ITERATIONS = flags.maxIterations || 10;
const CONTAINER_NAME = flags.container || null;
const WORK_DIR = `${PROJECT_PATH}/.local-development/${TASK_DIR}`;
const LOG_DIR = `${WORK_DIR}/logs`;
const METRICS_FILE = `${WORK_DIR}/metrics.jsonl`;

const now = new Date();
const RUN_ID = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
  "_",
  String(now.getHours()).padStart(2, "0"),
  String(now.getMinutes()).padStart(2, "0"),
  String(now.getSeconds()).padStart(2, "0"),
  "_",
  process.pid,
].join("");

// ---------------------------------------------------------------------------
// Scaffold directories
// ---------------------------------------------------------------------------

mkdirSync(LOG_DIR, { recursive: true });
if (!existsSync(`${WORK_DIR}/progress.txt`)) {
  writeFileSync(`${WORK_DIR}/progress.txt`, "");
}

// ---------------------------------------------------------------------------
// Detect task format: manifest.json (v2) vs tasks.json (v1)
// ---------------------------------------------------------------------------

const MANIFEST_PATH = `${WORK_DIR}/manifest.json`;
const TASKS_JSON_PATH = `${WORK_DIR}/tasks.json`;

const isV2 = existsSync(MANIFEST_PATH);
const isV1 = !isV2 && existsSync(TASKS_JSON_PATH);

if (!isV2 && !isV1) {
  console.error("[ralph-harness] No manifest.json or tasks.json found.");
  console.error(`  Expected at: ${WORK_DIR}/`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Task reading helpers
// ---------------------------------------------------------------------------

function readManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function readTasksJson() {
  return JSON.parse(readFileSync(TASKS_JSON_PATH, "utf-8"));
}

function readTaskFile(taskSubDir) {
  const p = `${WORK_DIR}/${taskSubDir}/task.json`;
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
}

function writeTaskFile(taskSubDir, data) {
  writeFileSync(
    `${WORK_DIR}/${taskSubDir}/task.json`,
    JSON.stringify(data, null, 2) + "\n"
  );
}

// ---------------------------------------------------------------------------
// Unified next-task detection
// ---------------------------------------------------------------------------

function detectNextTask() {
  return isV2 ? detectNextTaskV2() : detectNextTaskV1();
}

function detectNextTaskV2() {
  const manifest = readManifest();
  const entries = manifest.tasks || [];

  // Build status map from per-task directories
  const statusMap = {};
  for (const entry of entries) {
    const dir = entry.dir || `task-${entry.id}`;
    const data = readTaskFile(dir);
    statusMap[entry.id] = data?.status || "pending";
  }

  const pending = entries
    .filter((e) => statusMap[e.id] === "pending")
    .filter((e) => (e.blocked_by || []).every((dep) => statusMap[dep] === "done"))
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  if (pending.length === 0) return null;

  const next = pending[0];
  const dir = next.dir || `task-${next.id}`;
  const data = readTaskFile(dir) || next;

  const tier = data.tier || "lite";
  return {
    id: next.id,
    title: data.title || next.title || next.id,
    dir,
    tier,
    model: data.model || "sonnet",
    effort: data.effort || "medium",
    max_retries: data.max_retries ?? defaultRetries(tier),
    evaluator_model: data.evaluator_model || data.model || "sonnet",
  };
}

function detectNextTaskV1() {
  const { tasks } = readTasksJson();

  const pending = tasks
    .filter((t) => t.status === "pending")
    .filter((t) =>
      (t.blocked_by || []).every((dep) => {
        const d = tasks.find((tt) => tt.id === dep);
        return d && d.status === "done";
      })
    )
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  if (pending.length === 0) return null;

  const t = pending[0];
  const tier = t.tier || "lite";
  return {
    id: t.id,
    title: t.title,
    dir: null,
    tier,
    model: t.model || "sonnet",
    effort: t.effort || "medium",
    max_retries: t.max_retries ?? defaultRetries(tier),
    evaluator_model: t.evaluator_model || t.model || "sonnet",
  };
}

function defaultRetries(tier) {
  if (tier === "adversarial") return 3;
  if (tier === "standard") return 2;
  return 0;
}

// ---------------------------------------------------------------------------
// Task counts and completion checks
// ---------------------------------------------------------------------------

function countTasks() {
  if (isV2) {
    const entries = readManifest().tasks || [];
    let done = 0;
    for (const e of entries) {
      const data = readTaskFile(e.dir || `task-${e.id}`);
      if (data?.status === "done") done++;
    }
    return { total: entries.length, done };
  }
  const { tasks } = readTasksJson();
  return { total: tasks.length, done: tasks.filter((t) => t.status === "done").length };
}

function allTasksDone() {
  const { total, done } = countTasks();
  return done >= total;
}

function getTaskStatus(task) {
  if (isV2 && task.dir) {
    return readTaskFile(task.dir)?.status || "unknown";
  }
  const t = readTasksJson().tasks.find((tt) => tt.id === task.id);
  return t?.status || "unknown";
}

/**
 * For v1 tasks that need evaluation, ensure a per-task directory
 * with task.json exists so evaluator.js / contract-negotiation.js work.
 */
function ensureTaskDir(task) {
  if (task.dir) return `${WORK_DIR}/${task.dir}`;

  const dir = `${WORK_DIR}/_eval_${task.id}`;
  mkdirSync(dir, { recursive: true });

  const taskJsonPath = `${dir}/task.json`;
  if (!existsSync(taskJsonPath)) {
    const { tasks } = readTasksJson();
    const data = tasks.find((t) => t.id === task.id);
    if (data) writeFileSync(taskJsonPath, JSON.stringify(data, null, 2) + "\n");
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Metrics recording (same schema as ralph v1, extended with tier/phase/retry)
// ---------------------------------------------------------------------------

function recordMetrics(jsonOutput, iteration, taskId, taskTitle, taskStatus, extra = {}) {
  const usage = jsonOutput.usage || {};
  const modelUsage = jsonOutput.modelUsage || {};
  const modelKeys = Object.keys(modelUsage);
  const model = modelKeys[0] || "unknown";
  const contextWindow = modelKeys.length > 0 ? modelUsage[modelKeys[0]].contextWindow || 0 : 0;

  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const totalTokens = inputTokens + outputTokens + cacheCreation + cacheRead;

  const record = {
    run_id: RUN_ID,
    methodology: "ralph-harness",
    project: basename(PROJECT_PATH),
    task_dir: TASK_DIR,
    iteration,
    task: { id: taskId, title: taskTitle, status: taskStatus },
    tier: extra.tier || "lite",
    phase: extra.phase || "generator",
    retry: extra.retry || 0,
    session: {
      id: jsonOutput.session_id || "unknown",
      model,
      stop_reason: jsonOutput.stop_reason || "unknown",
      is_error: jsonOutput.is_error || false,
    },
    timing: {
      duration_ms: jsonOutput.duration_ms || 0,
      duration_api_ms: jsonOutput.duration_api_ms || 0,
      overhead_ms: (jsonOutput.duration_ms || 0) - (jsonOutput.duration_api_ms || 0),
    },
    tokens: { input: inputTokens, output: outputTokens, cache_creation: cacheCreation, cache_read: cacheRead, total: totalTokens },
    context: {
      window: contextWindow,
      usage_pct: contextWindow > 0 ? `${((totalTokens * 100) / contextWindow).toFixed(2)}%` : "0%",
    },
    cost_usd: jsonOutput.total_cost_usd || 0,
    num_turns: jsonOutput.num_turns || 0,
    timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };

  appendFileSync(METRICS_FILE, JSON.stringify(record) + "\n");
  return record;
}

// ---------------------------------------------------------------------------
// Claude / script spawning
// ---------------------------------------------------------------------------

function spawnGenerator(prompt, opts = {}) {
  const { model = "sonnet", effort = "medium" } = opts;

  const claudeArgs = [
    "claude", "-p",
    "--model", model,
    "--effort", effort,
    "--output-format", "json",
    prompt,
  ];

  const cmdArgs = CONTAINER_NAME
    ? ["docker", "exec", "-i", CONTAINER_NAME, ...claudeArgs]
    : claudeArgs;

  const proc = Bun.spawnSync(cmdArgs, { cwd: PROJECT_PATH, stderr: "pipe" });

  const jsonRaw = proc.stdout.toString();
  const stderrContent = proc.stderr.toString();

  let jsonResult;
  try { jsonResult = JSON.parse(jsonRaw); } catch { jsonResult = {}; }

  return { jsonResult, jsonRaw, stderrContent };
}

function getContainerImage() {
  if (!CONTAINER_NAME) return null;
  const proc = Bun.spawnSync([
    "docker", "inspect", "--format={{.Config.Image}}", CONTAINER_NAME,
  ]);
  return proc.stdout.toString().trim() || CONTAINER_NAME;
}

function runScript(scriptName, scriptArgs) {
  const scriptPath = resolve(SCRIPTS_DIR, scriptName);

  let cmdArgs;
  if (CONTAINER_NAME) {
    const image = getContainerImage();
    // Evaluator / contract-negotiation runs in a fresh container.
    // Project is read-only; task dir is writable (for feedback / contract).
    cmdArgs = [
      "docker", "run", "--rm",
      "-v", `${PROJECT_PATH}:/workspace:ro`,
      "-v", `${SCRIPTS_DIR}:/scripts:ro`,
      // Task dir may need writes (feedback, contract.json)
      ...scriptArgs.filter((a) => a.startsWith("/")).flatMap((a) => ["-v", `${a}:${a}`]),
      image,
      "bun", `/scripts/${scriptName}`, ...scriptArgs,
    ];
  } else {
    cmdArgs = ["bun", scriptPath, ...scriptArgs];
  }

  const proc = Bun.spawnSync(cmdArgs, {
    cwd: PROJECT_PATH,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 720_000,
  });

  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout?.toString() || "",
    stderr: proc.stderr?.toString() || "",
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildGeneratorPrompt(task) {
  const taskRef = isV2 ? "manifest.json" : "tasks.json";

  // In v2 mode, also reference the specific task.json
  const taskFileRef = isV2 && task.dir
    ? ` @${WORK_DIR}/${task.dir}/task.json`
    : "";

  return [
    `@${WORK_DIR}/PROMPT.md`,
    `@${WORK_DIR}/${taskRef}`,
    taskFileRef,
    `@${WORK_DIR}/progress.txt`,
    `@${WORK_DIR}/PRD.md`,
    "1. Find the next unblocked pending task (check blocked_by — all deps must be 'done').",
    "2. Mark it as in_progress.",
    "3. Implement the task using the skills listed in PROMPT.md.",
    "4. Run the project's typecheck/lint command.",
    "5. Mark as done.",
    "6. Update progress.txt with what was done.",
    "7. Use the conventional-commits skill to commit (feat/fix/test/refactor with task ID scope).",
    "ONLY WORK ON A SINGLE TASK.",
    "If the PRD is fully complete, output <promise>COMPLETE</promise>.",
  ].join(" ");
}

function buildRetryPrompt(task, feedbackText) {
  const taskRef = isV2 ? "manifest.json" : "tasks.json";
  const taskFileRef = isV2 && task.dir
    ? ` @${WORK_DIR}/${task.dir}/task.json`
    : "";

  return [
    `@${WORK_DIR}/PROMPT.md`,
    `@${WORK_DIR}/${taskRef}`,
    taskFileRef,
    `@${WORK_DIR}/progress.txt`,
    `@${WORK_DIR}/PRD.md`,
    `Task ${task.id} was evaluated by the adversarial evaluator and FAILED.`,
    "Fix ALL of the following issues:",
    "",
    feedbackText,
    "",
    "After fixing: run tests/lint, update progress.txt, and commit with conventional-commits.",
    `Scope: fix(${task.id}): fix evaluation failures.`,
    "ONLY FIX THE ISSUES ABOVE. Do not start new tasks.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Feedback reading
// ---------------------------------------------------------------------------

function getLastFeedback(taskDirPath) {
  const feedbackDir = `${taskDirPath}/feedback`;
  if (!existsSync(feedbackDir)) return "";

  const rounds = readdirSync(feedbackDir)
    .filter((f) => /^round-\d+\.json$/.test(f))
    .map((f) => ({ file: f, round: parseInt(f.match(/round-(\d+)/)[1], 10) }))
    .sort((a, b) => b.round - a.round);

  if (rounds.length === 0) return "";

  const latest = JSON.parse(readFileSync(`${feedbackDir}/${rounds[0].file}`, "utf-8"));
  const failed = (latest.scores || [])
    .filter((s) => !s.passed)
    .map(
      (s) =>
        `- **${s.name}** (score: ${s.score}): ${s.issues?.join("; ") || s.evidence || "no details"}\n  Recommendation: ${s.recommendation || "none"}`
    )
    .join("\n");

  return failed || "";
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function makeLogFile(iteration, taskId, retry) {
  const ts = new Date();
  const stamp = [
    ts.getFullYear(),
    String(ts.getMonth() + 1).padStart(2, "0"),
    String(ts.getDate()).padStart(2, "0"),
    "_",
    String(ts.getHours()).padStart(2, "0"),
    String(ts.getMinutes()).padStart(2, "0"),
    String(ts.getSeconds()).padStart(2, "0"),
  ].join("");
  const retrySuffix = retry > 0 ? `_r${retry}` : "";
  return `${LOG_DIR}/iter_${iteration}_${taskId}${retrySuffix}_${stamp}.log`;
}

function printSummary(jsonResult, status, phase) {
  const sec = ((jsonResult.duration_ms || 0) / 1000).toFixed(1);
  const turns = jsonResult.num_turns || 0;
  const outTok = jsonResult.usage?.output_tokens || 0;
  const cost = jsonResult.total_cost_usd || 0;
  console.log(`    \u21b3 ${status} | ${sec}s | ${turns} turns | ${outTok} out | $${cost} [${phase}]`);
}

// ---------------------------------------------------------------------------
// Tier executors
// ---------------------------------------------------------------------------

/**
 * LITE — identical to ralph v1. Generator implements + commits.
 */
function executeLite(task, iteration) {
  const logFile = makeLogFile(iteration, task.id, 0);
  const prompt = buildGeneratorPrompt(task);

  const { jsonResult, jsonRaw, stderrContent } = spawnGenerator(prompt, {
    model: task.model,
    effort: task.effort,
  });

  if (stderrContent) writeFileSync(`${logFile}.stderr`, stderrContent);
  writeFileSync(`${logFile}.json`, jsonRaw);

  const textResult = jsonResult.result || "ERROR: no result field";
  writeFileSync(logFile, textResult);

  const status = getTaskStatus(task);
  recordMetrics(jsonResult, iteration, task.id, task.title, status, {
    tier: "lite",
    phase: "generator",
  });
  printSummary(jsonResult, status, "lite");

  return { textResult, halted: false };
}

/**
 * STANDARD — Generator → Evaluator → retry loop.
 * On evaluator FAIL + retries left: feed feedback back to generator.
 * On evaluator FAIL + no retries: HALT.
 */
function executeStandard(task, iteration) {
  const maxRetries = task.max_retries;
  const taskDirPath = ensureTaskDir(task);

  for (let retry = 0; retry <= maxRetries; retry++) {
    const isRetry = retry > 0;
    const logFile = makeLogFile(iteration, task.id, retry);

    console.log(`  ${isRetry ? "\u21bb Retry" : "\u25b8 Attempt"} ${retry}/${maxRetries}`);

    // ── Generator phase ────────────────────────────────────────────────
    const prompt = isRetry
      ? buildRetryPrompt(task, getLastFeedback(taskDirPath))
      : buildGeneratorPrompt(task);

    const { jsonResult, jsonRaw, stderrContent } = spawnGenerator(prompt, {
      model: task.model,
      effort: task.effort,
    });

    if (stderrContent) writeFileSync(`${logFile}.stderr`, stderrContent);
    writeFileSync(`${logFile}.json`, jsonRaw);

    const textResult = jsonResult.result || "ERROR: no result field";
    writeFileSync(logFile, textResult);

    recordMetrics(jsonResult, iteration, task.id, task.title, "in_progress", {
      tier: task.tier,
      phase: "generator",
      retry,
    });
    printSummary(jsonResult, "generated", `${task.tier}-gen`);

    // ── Evaluator phase ────────────────────────────────────────────────
    console.log("  \u25b8 Evaluating...");

    const evalResult = runScript("evaluator.js", [PROJECT_PATH, taskDirPath, task.id]);

    if (evalResult.stderr) {
      // Print evaluator diagnostics (goes to stderr)
      for (const line of evalResult.stderr.split("\n").filter(Boolean)) {
        console.error(`    ${line}`);
      }
    }

    if (evalResult.exitCode === 0) {
      console.log("  \u2705 Evaluation PASSED");
      const status = getTaskStatus(task);
      recordMetrics(jsonResult, iteration, task.id, task.title, status, {
        tier: task.tier,
        phase: "evaluator-pass",
        retry,
      });
      return { textResult, halted: false };
    }

    if (evalResult.exitCode === 2) {
      console.error("  \u26a0 Evaluator config error — skipping evaluation");
      return { textResult, halted: false };
    }

    // FAIL
    console.log(`  \u274c Evaluation FAILED (attempt ${retry + 1}/${maxRetries + 1})`);

    if (retry >= maxRetries) {
      console.error(`  \ud83d\uded1 All retries exhausted for ${task.id} \u2014 HALTING`);
      recordMetrics(jsonResult, iteration, task.id, task.title, "halted", {
        tier: task.tier,
        phase: "evaluator-halt",
        retry,
      });
      return { textResult, halted: true };
    }
  }

  return { textResult: "", halted: true };
}

/**
 * ADVERSARIAL — Contract negotiation first, then standard build-evaluate loop.
 */
function executeAdversarial(task, iteration) {
  const taskDirPath = ensureTaskDir(task);
  const contractPath = `${taskDirPath}/contract.json`;

  // Phase 0: Negotiate contract (skip if already exists)
  if (!existsSync(contractPath)) {
    console.log("  \u25b8 Negotiating contract...");
    const result = runScript("contract-negotiation.js", [PROJECT_PATH, taskDirPath, task.id]);

    if (result.stderr) {
      for (const line of result.stderr.split("\n").filter(Boolean)) {
        console.error(`    ${line}`);
      }
    }

    if (result.exitCode === 0) {
      console.log("  \u2705 Contract negotiated");
    } else {
      console.error("  \u26a0 Contract negotiation failed \u2014 proceeding without contract");
    }
  } else {
    console.log("  \u25b8 Contract already exists, skipping negotiation");
  }

  // Then the standard build-evaluate loop (with adversarial retry count)
  return executeStandard(
    { ...task, tier: "adversarial", max_retries: task.max_retries },
    iteration
  );
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

const { total: TOTAL_TASKS, done: DONE_BEFORE } = countTasks();

console.log("");
console.log("\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
console.log("\u2551  RALPH HARNESS v2                        \u2551");
console.log(`\u2551  Project:   ${basename(PROJECT_PATH)}`);
console.log(`\u2551  Task dir:  ${TASK_DIR}`);
console.log(`\u2551  Max iter:  ${MAX_ITERATIONS}`);
console.log(`\u2551  Tasks:     ${DONE_BEFORE}/${TOTAL_TASKS} done`);
console.log(`\u2551  Format:    ${isV2 ? "manifest.json (v2)" : "tasks.json (v1)"}`);
if (CONTAINER_NAME) {
  console.log(`\u2551  Container: ${CONTAINER_NAME}`);
}
console.log(`\u2551  Run:       ${RUN_ID}`);
console.log("\u2551  Metrics:   metrics.jsonl");
console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");
console.log("");

for (let i = 1; i <= MAX_ITERATIONS; i++) {
  const task = detectNextTask();

  if (!task) {
    console.log("\u2713 No more unblocked tasks.");
    break;
  }

  console.log(
    `\u2501\u2501\u2501 Iteration ${i}/${MAX_ITERATIONS} \u2014 ${task.id}: ${task.title} [${task.tier}] \u2501\u2501\u2501`
  );

  let result;

  switch (task.tier) {
    case "adversarial":
      result = executeAdversarial(task, i);
      break;
    case "standard":
      result = executeStandard(task, i);
      break;
    case "lite":
    default:
      result = executeLite(task, i);
      break;
  }

  // HALT — evaluation retries exhausted, broken code must not propagate
  if (result.halted) {
    console.log("");
    console.log(`\ud83d\uded1 HALTED \u2014 ${task.id} failed evaluation after all retries`);
    console.log(`  Review feedback in: ${ensureTaskDir(task)}/feedback/`);
    console.log(`  Metrics: ${METRICS_FILE}`);
    process.exit(1);
  }

  // PRD completion signal from generator
  if (result.textResult.includes("<promise>COMPLETE</promise>")) {
    console.log("");
    console.log(`\u2713 PRD COMPLETE after ${i} iterations`);
    console.log(`  Metrics: ${METRICS_FILE}`);
    process.exit(0);
  }

  // All tasks done
  if (allTasksDone()) {
    console.log("");
    console.log(`\u2713 All tasks done after ${i} iterations`);
    console.log(`  Metrics: ${METRICS_FILE}`);
    process.exit(0);
  }

  console.log("");
}

console.log(`Max iterations (${MAX_ITERATIONS}) reached.`);
console.log(`Metrics: ${METRICS_FILE}`);
