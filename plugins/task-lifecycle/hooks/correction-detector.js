#!/usr/bin/env bun

/**
 * correction-detector.js — UserPromptSubmit hook
 *
 * Detects when the user is correcting the agent and nudges them to capture
 * the pattern as a [LEARN] block. Also detects explicit learning triggers.
 *
 * Input (stdin):  Claude Code UserPromptSubmit JSON { prompt, session_id, ... }
 * Output (stdout): { additionalContext? } or {}
 * Logging (stderr): diagnostic messages
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";

const COUNTER_DIR = "/tmp/task-lifecycle";
const TIMEOUT_MS = 5000;

// Patterns that indicate the user is correcting the agent
const CORRECTION_PATTERNS = [
  /\bno[,.]?\s+that\b.{0,10}\b(wrong|incorrect)\b/i,
  /\byou\s+(should|shouldn'?t|need to|forgot)\b/i,
  /\bthat'?s?\s+not\s+what\s+i\s+(meant|asked|wanted)\b/i,
  /\bwrong\s+file\b/i,
  /\bundo\s+that\b/i,
  /\brevert\s+(that|this|it)\b/i,
  /\bdon'?t\s+do\s+that\b/i,
  /\b(stop|wait)[,!.]\s/i,
  /^(stop|wait)[,!.]?$/i,
];

// Patterns that indicate the user wants to capture a learning explicitly
const LEARN_TRIGGER_PATTERNS = [
  /\bremember\s+this\b/i,
  /\badd\s+to\s+rules\b/i,
  /\blearn\s+from\s+this\b/i,
  /\[LEARN\]/,
];

function isCorrectionMessage(prompt) {
  return CORRECTION_PATTERNS.some((re) => re.test(prompt));
}

function isLearnTrigger(prompt) {
  return LEARN_TRIGGER_PATTERNS.some((re) => re.test(prompt));
}

function incrementCounter(sessionId) {
  const counterPath = `${COUNTER_DIR}/corrections-${sessionId}`;
  try {
    mkdirSync(COUNTER_DIR, { recursive: true });
    const current = existsSync(counterPath)
      ? parseInt(readFileSync(counterPath, "utf8").trim(), 10) || 0
      : 0;
    const next = current + 1;
    writeFileSync(counterPath, String(next));
    console.error(`[correction-detector] Correction #${next} for session ${sessionId}`);
  } catch (err) {
    console.error("[correction-detector] Failed to update counter:", err.message);
  }
}

async function main() {
  let input;
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch (err) {
    console.error("[correction-detector] Failed to parse stdin JSON:", err.message);
    console.log(JSON.stringify({}));
    return;
  }

  const { prompt = "", session_id = "unknown" } = input;

  const correction = isCorrectionMessage(prompt);
  const learnTrigger = isLearnTrigger(prompt);

  if (!correction && !learnTrigger) {
    console.log(JSON.stringify({}));
    return;
  }

  if (correction) {
    incrementCounter(session_id);
  } else {
    console.error("[correction-detector] Learning trigger detected");
  }

  const LEARN_TEMPLATE = [
    "",
    "  [LEARN] Category: <rule description>",
    "  Mistake: <what went wrong>",
    "  Correction: <how it should be done>",
    "",
    "Valid categories: Architecture, Testing, Quality, Git, Performance, Navigation, Editing, Context",
  ].join("\n");

  const additionalContext = correction
    ? `Correction detected. If this reveals a recurring mistake or rule worth remembering, capture it:${LEARN_TEMPLATE}`
    : `The user wants to capture a learning. Please write a [LEARN] block:${LEARN_TEMPLATE}`;

  console.log(JSON.stringify({ additionalContext }));
}

// Enforce 5-second timeout
const timer = setTimeout(() => {
  console.error("[correction-detector] Timeout — allowing prompt");
  console.log(JSON.stringify({}));
  process.exit(0);
}, TIMEOUT_MS);

main()
  .catch((err) => {
    console.error("[correction-detector] Unexpected error:", err.message);
    console.log(JSON.stringify({}));
  })
  .finally(() => clearTimeout(timer));
