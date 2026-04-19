#!/usr/bin/env bun

/**
 * research-summary.js — generates a research summary after ralph completes.
 *
 * Usage: research-summary.js <project-path> <task-dir>
 *
 * Reads metrics.jsonl, scans for proposal files, and saves a markdown
 * summary to .local-development/{task-dir}/research-summary.md.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { resolve, join } from "path";

const [, , projectPath, taskDir] = process.argv;

if (!projectPath || !taskDir) {
  console.error("Usage: research-summary.js <project-path> <task-dir>");
  process.exit(1);
}

const localDevDir = resolve(projectPath, ".local-development");
const taskRunDir = resolve(localDevDir, taskDir);
const metricsPath = resolve(taskRunDir, "metrics.jsonl");
const researchDir = resolve(localDevDir, "research");
const proposalsDir = resolve(researchDir, "proposals");
const observationsDir = resolve(researchDir, "observations");
const outputPath = resolve(taskRunDir, "research-summary.md");

// ─── Parse metrics.jsonl ─────────────────────────────────────────────────────

/** @type {Array<Record<string, any>>} */
const metrics = [];

if (existsSync(metricsPath)) {
  const lines = readFileSync(metricsPath, "utf8").trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      metrics.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
}

// ─── Aggregate metrics ───────────────────────────────────────────────────────

// Unique tasks (by id)
const tasksSeen = new Map();
for (const entry of metrics) {
  const id = entry.task?.id;
  if (!id) continue;
  if (!tasksSeen.has(id)) {
    tasksSeen.set(id, { count: 0, title: entry.task?.title ?? id, status: entry.task?.status });
  }
  tasksSeen.get(id).count++;
  // Keep the last status seen
  tasksSeen.get(id).status = entry.task?.status ?? tasksSeen.get(id).status;
}

const totalTasks = tasksSeen.size;
const retriedTasks = [...tasksSeen.values()].filter((t) => t.count > 1).length;
const retryRate = totalTasks > 0 ? ((retriedTasks / totalTasks) * 100).toFixed(1) : "0.0";

const totalCost = metrics.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);
const totalDurationMs = metrics.reduce((sum, e) => sum + (e.timing?.duration_ms ?? 0), 0);
const totalDurationMin = (totalDurationMs / 60000).toFixed(1);

// Evaluator scores from feedback entries (adversarial harness)
const evaluatorScores = metrics
  .map((e) => e.evaluator_score)
  .filter((s) => typeof s === "number");
const avgScore =
  evaluatorScores.length > 0
    ? (evaluatorScores.reduce((a, b) => a + b, 0) / evaluatorScores.length).toFixed(2)
    : null;

// ─── Scan proposal files ─────────────────────────────────────────────────────

/** @typedef {{ file: string, title: string, status: string | null }} ProposalEntry */

/** @type {ProposalEntry[]} */
const proposals = [];

if (existsSync(proposalsDir)) {
  const files = readdirSync(proposalsDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const content = readFileSync(resolve(proposalsDir, file), "utf8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    const statusMatch = content.match(/status:\s*(\w+)/i);
    proposals.push({
      file,
      title: titleMatch ? titleMatch[1].trim() : file.replace(".md", ""),
      status: statusMatch ? statusMatch[1].toLowerCase() : null,
    });
  }
}

// ─── Scan observations not yet formalized as proposals ───────────────────────

/** @type {string[]} */
const observations = [];

if (existsSync(observationsDir)) {
  const files = readdirSync(observationsDir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const content = readFileSync(resolve(observationsDir, file), "utf8");
    const titleMatch = content.match(/^#\s+(.+)/m);
    const label = titleMatch ? titleMatch[1].trim() : file.replace(".md", "");
    observations.push(`- \`${file}\` — ${label}`);
  }
}

// Also collect any retried tasks as implicit observations
const retriedTaskList = [...tasksSeen.entries()]
  .filter(([, t]) => t.count > 1)
  .map(([id, t]) => `- **${id}** (${t.title}) — retried ${t.count - 1}x`);

// ─── Build markdown ──────────────────────────────────────────────────────────

const now = new Date().toISOString();
const lines = [
  `# Research Summary — ${taskDir}`,
  ``,
  `_Generated: ${now}_`,
  ``,
  `## Metrics Summary`,
  ``,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Total tasks | ${totalTasks} |`,
  `| Total cost | $${totalCost.toFixed(4)} |`,
  `| Total duration | ${totalDurationMin} min |`,
  `| Retry rate | ${retryRate}% (${retriedTasks}/${totalTasks} tasks retried) |`,
];

if (avgScore !== null) {
  lines.push(`| Avg evaluator score | ${avgScore}/10 |`);
} else {
  lines.push(`| Avg evaluator score | n/a (no adversarial runs) |`);
}

lines.push(``);
lines.push(`### Task Breakdown`);
lines.push(``);
lines.push(`| Task ID | Title | Runs | Final Status |`);
lines.push(`|---------|-------|------|--------------|`);
for (const [id, t] of tasksSeen.entries()) {
  lines.push(`| ${id} | ${t.title} | ${t.count} | ${t.status ?? "unknown"} |`);
}

// Proposals section
lines.push(``);
lines.push(`## New Proposals Written`);
lines.push(``);
if (proposals.length === 0) {
  lines.push(`_No proposals found in \`${proposalsDir}\`._`);
} else {
  for (const p of proposals) {
    const statusBadge = p.status ? ` [\`${p.status}\`]` : "";
    lines.push(`- \`${p.file}\`${statusBadge} — ${p.title}`);
  }
}

// Observations section
lines.push(``);
lines.push(`## Observations`);
lines.push(``);

if (retriedTaskList.length > 0) {
  lines.push(`### Tasks Requiring Retries`);
  lines.push(``);
  lines.push(...retriedTaskList);
  lines.push(``);
}

if (observations.length > 0) {
  lines.push(`### Informal Observations (not yet proposals)`);
  lines.push(``);
  lines.push(...observations);
  lines.push(``);
}

if (retriedTaskList.length === 0 && observations.length === 0) {
  lines.push(`_No notable observations recorded._`);
}

const markdown = lines.join("\n");

// ─── Write output ─────────────────────────────────────────────────────────────

mkdirSync(taskRunDir, { recursive: true });
writeFileSync(outputPath, markdown, "utf8");

console.log(`Research summary written to: ${outputPath}`);
console.log(`  Tasks: ${totalTasks} | Cost: $${totalCost.toFixed(4)} | Duration: ${totalDurationMin} min`);
console.log(`  Retry rate: ${retryRate}% | Proposals: ${proposals.length} | Observations: ${observations.length}`);
