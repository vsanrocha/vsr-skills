#!/usr/bin/env bun

/**
 * Contract Negotiation — negotiates evaluation criteria before implementation.
 *
 * Usage: contract-negotiation.js <project-path> <task-dir> <task-id>
 *
 * Phase 1: Generator proposes 5-15 specific, testable criteria with thresholds.
 * Phase 2: Evaluator reviews and tightens criteria (adds edge cases, raises bars).
 * Output:  contract.json saved to the task directory.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

// ── CLI args ────────────────────────────────────────────────────────────────

const [projectPath, taskDir, taskId] = process.argv.slice(2);

if (!projectPath || !taskDir || !taskId) {
  console.error(
    "Usage: contract-negotiation.js <project-path> <task-dir> <task-id>"
  );
  process.exit(2);
}

const absTaskDir = resolve(projectPath, taskDir);
const taskJsonPath = resolve(absTaskDir, "task.json");

if (!existsSync(taskJsonPath)) {
  console.error(`Error: task.json not found at ${taskJsonPath}`);
  process.exit(2);
}

const task = JSON.parse(readFileSync(taskJsonPath, "utf8"));
const contractPath = resolve(absTaskDir, "contract.json");

console.error(`[contract-negotiation] Task: ${task.title || taskId}`);
console.error(`[contract-negotiation] Phase 1: Generator proposes criteria...`);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Spawn `claude -p` with the given prompt and return parsed JSON.
 * Falls back to extracting the first JSON block from the response
 * if the structured output isn't pure JSON.
 */
function spawnClaude(prompt, model) {
  const args = ["claude", "-p", "--output-format", "json"];
  if (model) args.push("--model", model);

  const result = Bun.spawnSync(args, {
    stdin: Buffer.from(prompt),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
    timeout: 120_000,
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(
      `claude exited with code ${result.exitCode}: ${stderr || "(no stderr)"}`
    );
  }

  const raw = result.stdout.toString().trim();
  return parseJsonResponse(raw);
}

/**
 * Extract valid JSON from a Claude response.
 * Handles both pure JSON responses and JSON wrapped in markdown code blocks.
 * Also handles the claude --output-format json envelope: { result: "..." }
 */
function parseJsonResponse(raw) {
  // First, try direct parse
  try {
    const parsed = JSON.parse(raw);
    // claude --output-format json wraps in { result: "..." }
    if (parsed.result && typeof parsed.result === "string") {
      return extractJson(parsed.result);
    }
    return parsed;
  } catch {
    // fall through
  }
  return extractJson(raw);
}

/**
 * Extract JSON from a string that may contain markdown fences or prose.
 */
function extractJson(text) {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  // Try extracting from markdown code block
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // fall through
    }
  }

  // Try finding first { ... } or [ ... ] block
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // fall through
    }
  }

  throw new Error(`Failed to extract JSON from response:\n${text.slice(0, 500)}`);
}

/**
 * Validate that a criteria array has the expected shape.
 */
function validateCriteria(criteria) {
  if (!Array.isArray(criteria)) {
    throw new Error("Criteria must be an array");
  }
  if (criteria.length < 3 || criteria.length > 20) {
    throw new Error(
      `Expected 3-20 criteria, got ${criteria.length}`
    );
  }
  for (const c of criteria) {
    if (!c.name || typeof c.name !== "string") {
      throw new Error(`Criterion missing 'name': ${JSON.stringify(c)}`);
    }
    if (!c.description || typeof c.description !== "string") {
      throw new Error(
        `Criterion '${c.name}' missing 'description'`
      );
    }
    // Ensure threshold is a number, default to 7
    c.threshold =
      typeof c.threshold === "number" ? c.threshold : 7;
  }
  return criteria;
}

// ── Phase 1: Generator proposes criteria ────────────────────────────────────

const generatorPrompt = `You are a senior QA engineer designing evaluation criteria for a coding task.

## Task
- ID: ${taskId}
- Title: ${task.title || "N/A"}
- Description: ${task.description || "N/A"}

## Instructions

Propose 5-15 specific, testable evaluation criteria for this task. Each criterion must be:
- Objectively verifiable (not subjective like "clean code")
- Specific enough that two reviewers would agree on the score
- Covering functional correctness, edge cases, and error handling

For each criterion, include:
- name: short snake_case identifier
- description: precise description of what to verify, including expected behavior
- threshold: minimum passing score 1-10 (default 7, raise to 8-9 for critical criteria like security or data integrity)

## Scoring Guide Reference
- 9-10: Exceptional — handles all edge cases, production-ready
- 7-8: Good — core functionality works, minor edge cases acceptable
- 5-6: Partial — significant gaps or broken edge cases
- 3-4: Poor — barely functional
- 1-2: Failed or not implemented

## Output

Return ONLY a JSON object with this exact schema:
{
  "criteria": [
    {
      "name": "criterion_name",
      "description": "What to verify and expected behavior",
      "threshold": 7
    }
  ]
}

No markdown, no explanation — pure JSON only.`;

let generatorCriteria;
try {
  const generatorResponse = spawnClaude(generatorPrompt, task.generator_model);
  generatorCriteria = validateCriteria(
    generatorResponse.criteria || generatorResponse
  );
  console.error(
    `[contract-negotiation] Generator proposed ${generatorCriteria.length} criteria`
  );
} catch (err) {
  console.error(`[contract-negotiation] Phase 1 failed: ${err.message}`);
  process.exit(1);
}

// ── Phase 2: Evaluator tightens criteria ────────────────────────────────────

console.error(`[contract-negotiation] Phase 2: Evaluator tightens criteria...`);

const evaluatorPrompt = `You are a skeptical QA evaluator reviewing proposed evaluation criteria for a coding task.
Your job is to make the criteria HARDER to pass, not easier. Be adversarial.

## Task
- ID: ${taskId}
- Title: ${task.title || "N/A"}
- Description: ${task.description || "N/A"}

## Proposed Criteria
${JSON.stringify(generatorCriteria, null, 2)}

## Your Job

Review each criterion and:
1. TIGHTEN vague descriptions — add specific edge cases that MUST be tested
2. RAISE thresholds for security, data integrity, or correctness criteria (to 8 or 9)
3. ADD missing criteria for edge cases the generator overlooked (e.g., error handling, boundary conditions, concurrency, invalid input)
4. REMOVE criteria that are untestable or redundant
5. Ensure the total is 5-15 criteria

## Anti-Sycophancy Rules
- Do NOT approve criteria just because they look reasonable
- Do NOT lower any threshold below what the generator proposed
- You MUST add at least one criterion the generator missed
- If a description says "should work" — replace with specific, verifiable behavior

## Output

Return ONLY a JSON object with this exact schema:
{
  "criteria": [
    {
      "name": "criterion_name",
      "description": "Tightened description with specific edge cases",
      "threshold": 7
    }
  ]
}

No markdown, no explanation — pure JSON only.`;

let finalCriteria;
let evaluatorModel = task.evaluator_model || null;
try {
  const evaluatorResponse = spawnClaude(evaluatorPrompt, evaluatorModel);
  finalCriteria = validateCriteria(
    evaluatorResponse.criteria || evaluatorResponse
  );
  console.error(
    `[contract-negotiation] Evaluator finalized ${finalCriteria.length} criteria`
  );
} catch (err) {
  console.error(`[contract-negotiation] Phase 2 failed: ${err.message}`);
  console.error(
    `[contract-negotiation] Falling back to generator criteria`
  );
  finalCriteria = generatorCriteria;
}

// ── Save contract.json ──────────────────────────────────────────────────────

const contract = {
  task_id: taskId,
  criteria: finalCriteria,
  negotiated_at: new Date().toISOString(),
  generator_model: task.generator_model || "default",
  evaluator_model: evaluatorModel || "default",
};

// Ensure task directory exists
mkdirSync(absTaskDir, { recursive: true });
writeFileSync(contractPath, JSON.stringify(contract, null, 2) + "\n", "utf8");

console.error(
  `[contract-negotiation] Contract saved to ${contractPath}`
);
console.error(
  `[contract-negotiation] ${finalCriteria.length} criteria, thresholds: ${finalCriteria.map((c) => c.threshold).join(", ")}`
);

// Output contract to stdout for piping
console.log(JSON.stringify(contract, null, 2));

process.exit(0);
