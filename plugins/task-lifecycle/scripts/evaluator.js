#!/usr/bin/env bun

/**
 * Adversarial Evaluator — spawns a Claude session that scores implementation
 * against contract criteria, actively trying to BREAK the code.
 *
 * Usage: evaluator.js <project-path> <task-dir> <task-id>
 *
 * Reads task.json and contract.json from <task-dir>.
 * Saves feedback to <task-dir>/feedback/round-{n}.json.
 * Exit 0 = ALL criteria >= threshold (PASS).
 * Exit 1 = any criterion below threshold (FAIL).
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve, basename } from "path";
import { spawnSync } from "child_process";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const [projectPath, taskDir, taskId] = process.argv.slice(2);

if (!projectPath || !taskDir || !taskId) {
  console.error("Usage: evaluator.js <project-path> <task-dir> <task-id>");
  process.exit(2);
}

const absProject = resolve(projectPath);
const absTaskDir = resolve(taskDir);

// ---------------------------------------------------------------------------
// Load task + contract
// ---------------------------------------------------------------------------

const taskJsonPath = resolve(absTaskDir, "task.json");
const contractJsonPath = resolve(absTaskDir, "contract.json");

if (!existsSync(taskJsonPath)) {
  console.error(`task.json not found at ${taskJsonPath}`);
  process.exit(2);
}

const task = JSON.parse(readFileSync(taskJsonPath, "utf-8"));

let contract = null;
if (existsSync(contractJsonPath)) {
  contract = JSON.parse(readFileSync(contractJsonPath, "utf-8"));
}

// Build criteria list — from contract if available, otherwise from task
const criteria = contract?.criteria ?? task.criteria ?? [];
if (criteria.length === 0) {
  console.error("No evaluation criteria found in contract.json or task.json");
  process.exit(2);
}

const passThreshold = contract?.pass_threshold ?? 7;

// ---------------------------------------------------------------------------
// Determine round number
// ---------------------------------------------------------------------------

const feedbackDir = resolve(absTaskDir, "feedback");
mkdirSync(feedbackDir, { recursive: true });

const existingRounds = readdirSync(feedbackDir)
  .filter((f) => /^round-\d+\.json$/.test(f))
  .map((f) => parseInt(f.match(/round-(\d+)\.json/)[1], 10));

const round = existingRounds.length > 0 ? Math.max(...existingRounds) + 1 : 1;

// ---------------------------------------------------------------------------
// Build evaluator system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt() {
  const criteriaBlock = criteria
    .map(
      (c, i) =>
        `${i + 1}. **${c.name}** — ${c.description} (threshold: ${c.threshold ?? passThreshold})`
    )
    .join("\n");

  return `You are a skeptical QA engineer. Your job is to BREAK the implementation, not validate it.

## Rules
- Do NOT be generous. Your natural inclination will be to praise the work. Resist this.
- Do NOT talk yourself into approving mediocre work. When in doubt, FAIL it.
- You CANNOT modify code. You can only read, run, and judge.
- Score each criterion independently on a 1-10 scale.
- A score of ${passThreshold}+ means it WORKS correctly including edge cases.
- A score of ${passThreshold - 1} or below means it FAILS — describe exactly why with file:line references.

## Scoring Guide
- 9-10: Exceptional, handles edge cases, production-ready
- 7-8: Good, core functionality works, minor edge cases ok
- 5-6: Partial, significant gaps or broken edge cases
- 3-4: Poor, barely functional
- 1-2: Failed or not implemented

## Contract Criteria
${criteriaBlock}

## Process
1. Read the contract criteria above
2. Read the implementation code in the project at: ${absProject}
3. Run the app/tests to verify behavior
4. For EACH criterion: test it, break it, score it
5. Output structured JSON feedback

## Anti-Sycophancy Check
Before submitting scores, ask yourself:
- Am I giving a ${passThreshold}+ because it actually works, or because the code LOOKS reasonable?
- Did I actually RUN the test case, or am I inferring from code reading?
- Would a hostile user find a way to break this?

## Output Format
You MUST output ONLY valid JSON matching this exact schema (no markdown, no commentary):
{
  "scores": [
    {
      "name": "<criterion name>",
      "score": <1-10>,
      "passed": <true if score >= threshold>,
      "evidence": "<what you tested and observed>",
      "issues": ["<file:line — description of problem>"],
      "recommendation": "<how to fix, if failed>"
    }
  ],
  "overall_passed": <true if ALL criteria pass>,
  "summary": "<1-2 sentence overall assessment>"
}`;
}

// ---------------------------------------------------------------------------
// Build user prompt
// ---------------------------------------------------------------------------

function buildUserPrompt() {
  const taskDesc = task.description || task.title || taskId;
  const prevFeedbackPath = round > 1 ? resolve(feedbackDir, `round-${round - 1}.json`) : null;

  let prevFeedback = "";
  if (prevFeedbackPath && existsSync(prevFeedbackPath)) {
    const prev = JSON.parse(readFileSync(prevFeedbackPath, "utf-8"));
    const failedCriteria = prev.scores
      .filter((s) => !s.passed)
      .map((s) => `- ${s.name} (score: ${s.score}): ${s.issues?.join("; ") || "no details"}`)
      .join("\n");

    if (failedCriteria) {
      prevFeedback = `\n\n## Previous Round Failures (round ${round - 1})\nThe following criteria failed last round. Pay extra attention to whether they were actually fixed:\n${failedCriteria}`;
    }
  }

  return `Evaluate task "${taskId}" — ${taskDesc}

Project path: ${absProject}
Task directory: ${absTaskDir}

Evaluate ALL ${criteria.length} criteria from the contract. Be adversarial.${prevFeedback}`;
}

// ---------------------------------------------------------------------------
// Spawn evaluator Claude session
// ---------------------------------------------------------------------------

const systemPrompt = buildSystemPrompt();
const userPrompt = buildUserPrompt();

console.error(`[evaluator] Round ${round} — evaluating ${criteria.length} criteria (threshold: ${passThreshold})`);
console.error(`[evaluator] Task: ${taskId}`);
console.error(`[evaluator] Project: ${absProject}`);

const result = spawnSync(
  "claude",
  [
    "-p", userPrompt,
    "--system-prompt", systemPrompt,
    "--output-format", "json",
    "--allowedTools", "Read,Bash,Glob,Grep",
    "--max-turns", "30",
  ],
  {
    cwd: absProject,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 600_000, // 10 min
    env: { ...process.env },
  }
);

if (result.error) {
  console.error(`[evaluator] Failed to spawn claude: ${result.error.message}`);
  process.exit(2);
}

if (result.stderr?.length > 0) {
  console.error(`[evaluator] stderr: ${result.stderr.toString().slice(0, 500)}`);
}

// ---------------------------------------------------------------------------
// Parse output
// ---------------------------------------------------------------------------

let claudeOutput;
try {
  claudeOutput = JSON.parse(result.stdout.toString());
} catch {
  console.error("[evaluator] Failed to parse claude JSON output");
  console.error("[evaluator] Raw stdout:", result.stdout?.toString().slice(0, 1000));
  process.exit(2);
}

// claude --output-format json wraps the response in { result, ... }
const rawText = claudeOutput.result ?? claudeOutput.content ?? result.stdout.toString();

// Extract JSON from the response text (may be wrapped in markdown code fences)
let evaluatorResult;
try {
  // Try direct parse first
  evaluatorResult = typeof rawText === "object" ? rawText : JSON.parse(rawText);
} catch {
  // Try extracting JSON from code fences or embedded in text
  const jsonMatch = String(rawText).match(/\{[\s\S]*"scores"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      evaluatorResult = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("[evaluator] Could not parse extracted JSON from response");
      console.error("[evaluator] Raw text:", String(rawText).slice(0, 1000));
      process.exit(2);
    }
  } else {
    console.error("[evaluator] No JSON with 'scores' found in evaluator response");
    console.error("[evaluator] Raw text:", String(rawText).slice(0, 1000));
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Validate and enrich scores
// ---------------------------------------------------------------------------

const scores = (evaluatorResult.scores || []).map((s) => {
  const threshold = criteria.find((c) => c.name === s.name)?.threshold ?? passThreshold;
  return {
    name: s.name,
    score: Number(s.score) || 0,
    passed: Number(s.score) >= threshold,
    evidence: s.evidence || "",
    issues: Array.isArray(s.issues) ? s.issues : [],
    recommendation: s.recommendation || "",
  };
});

const overallPassed = scores.length > 0 && scores.every((s) => s.passed);

// Detect model from claude output metadata
const evaluatorModel = claudeOutput.model || process.env.EVALUATOR_MODEL || "unknown";

// ---------------------------------------------------------------------------
// Build feedback
// ---------------------------------------------------------------------------

const feedback = {
  task_id: taskId,
  round,
  evaluator_model: evaluatorModel,
  timestamp: new Date().toISOString(),
  scores,
  overall_passed: overallPassed,
  summary: evaluatorResult.summary || "",
};

// ---------------------------------------------------------------------------
// Save feedback
// ---------------------------------------------------------------------------

const feedbackPath = resolve(feedbackDir, `round-${round}.json`);
writeFileSync(feedbackPath, JSON.stringify(feedback, null, 2) + "\n");

console.error(`[evaluator] Feedback saved to ${feedbackPath}`);
console.error(`[evaluator] Result: ${overallPassed ? "PASS ✅" : "FAIL ❌"}`);

if (!overallPassed) {
  const failed = scores.filter((s) => !s.passed);
  console.error(`[evaluator] Failed criteria (${failed.length}):`);
  for (const f of failed) {
    console.error(`  - ${f.name}: ${f.score}/${criteria.find((c) => c.name === f.name)?.threshold ?? passThreshold} — ${f.issues[0] || "no details"}`);
  }
}

// Output feedback JSON to stdout for piping
console.log(JSON.stringify(feedback, null, 2));

process.exit(overallPassed ? 0 : 1);
