#!/usr/bin/env bun

// Stop hook: Research Proposal Reminder
// At the end of each agent response, checks for signals that indicate a potential
// improvement opportunity worth documenting as a research proposal.
// Triggers at most once per 5 responses to avoid spamming the agent.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const HOOK_TIMEOUT_MS = 5000;
const RESPONSE_TRIGGER_INTERVAL = 5;
const TMP_DIR = join(tmpdir(), "task-lifecycle");
const cwd = process.cwd();

// Signals indicating a potential improvement opportunity
const SIGNAL_PATTERNS = {
  highCost: [
    /\bexpensive\b/i,
    /\bcost\b.*\$[\d.]+/i,
    /\$[\d.]+.*\bcost\b/i,
    /\btoo many tokens\b/i,
    /\btoken limit\b/i,
  ],
  retries: [
    /\bretry\b/i,
    /\bretried\b/i,
    /\bfailed evaluation\b/i,
    /\btry again\b/i,
    /\battempt \d+/i,
    /\bkeep failing\b/i,
  ],
  skillGaps: [
    /\bI cannot\b/i,
    /\bI can't\b/i,
    /\bnot supported\b/i,
    /\bno tool for\b/i,
    /\bno way to\b/i,
    /\bunable to\b/i,
    /\bnot possible\b/i,
  ],
  wastedWork: [
    /\bunnecessary\b/i,
    /\bredundant\b/i,
    /\bcould have been avoided\b/i,
    /\bwasted\b/i,
    /\bduplicated effort\b/i,
    /\bdid the same thing twice\b/i,
  ],
};

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) {
    mkdirSync(TMP_DIR, { recursive: true });
  }
}

function getCounterFile(sessionId) {
  return join(TMP_DIR, `research-reminder-${sessionId}`);
}

function readCounter(sessionId) {
  const file = getCounterFile(sessionId);
  if (!existsSync(file)) return 0;
  try {
    return parseInt(readFileSync(file, "utf-8").trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeCounter(sessionId, count) {
  writeFileSync(getCounterFile(sessionId), String(count), "utf-8");
}

function detectSignals(text) {
  const detected = [];

  for (const [category, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) {
      detected.push(category);
    }
  }

  return detected;
}

function findResearchDir() {
  // Check for project-local research dir first
  const localDir = join(cwd, ".local-development", "research");
  if (existsSync(localDir)) return localDir;

  // Fall back to ~/.agents/research/workflow
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const agentsDir = join(homeDir, ".agents", "research", "workflow");
  if (existsSync(agentsDir)) return agentsDir;

  // Return the expected local path even if it doesn't exist yet
  return localDir;
}

async function main() {
  const raw = await Bun.stdin.text();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[research-reminder] Failed to parse stdin JSON");
    console.log(JSON.stringify({}));
    return;
  }

  // Infinite loop protection
  if (input.stop_hook_active) {
    console.error("[research-reminder] stop_hook_active=true, skipping");
    console.log(JSON.stringify({}));
    return;
  }

  const sessionId = input.session_id || "default";
  const lastMessage = input.assistant_response || input.last_assistant_message || "";

  if (!lastMessage) {
    console.error("[research-reminder] No assistant message found, skipping");
    console.log(JSON.stringify({}));
    return;
  }

  ensureTmpDir();

  // Rate limiting: only trigger once per RESPONSE_TRIGGER_INTERVAL responses
  const counter = readCounter(sessionId);
  const newCounter = counter + 1;
  writeCounter(sessionId, newCounter);

  if (newCounter % RESPONSE_TRIGGER_INTERVAL !== 0) {
    console.error(
      `[research-reminder] Response ${newCounter}, triggering every ${RESPONSE_TRIGGER_INTERVAL}. Next check at ${Math.ceil(newCounter / RESPONSE_TRIGGER_INTERVAL) * RESPONSE_TRIGGER_INTERVAL}.`
    );
    console.log(JSON.stringify({}));
    return;
  }

  const signals = detectSignals(lastMessage);

  if (signals.length === 0) {
    console.error("[research-reminder] No improvement signals detected");
    console.log(JSON.stringify({}));
    return;
  }

  const researchDir = findResearchDir();
  const proposalsDir = join(researchDir, "proposals");

  const signalLabels = {
    highCost: "high cost",
    retries: "retries or failures",
    skillGaps: "skill gaps or missing tools",
    wastedWork: "wasted or redundant work",
  };

  const detectedLabels = signals.map((s) => signalLabels[s] || s).join(", ");

  console.error(
    `[research-reminder] Signals detected: ${detectedLabels}. Reminding agent to write proposal.`
  );

  const additionalContext =
    `You may have observed an improvement opportunity (signals: ${detectedLabels}). ` +
    `If genuine, write a research proposal to ${proposalsDir}/. ` +
    `See ralph-execution.mdc for the proposal template.`;

  console.log(JSON.stringify({ additionalContext }));
}

// Run with timeout
const timeout = setTimeout(() => {
  console.error("[research-reminder] Timeout reached, allowing through");
  console.log(JSON.stringify({}));
  process.exit(0);
}, HOOK_TIMEOUT_MS);

main()
  .catch((err) => {
    console.error(`[research-reminder] Fatal error: ${err.message}`);
    console.log(JSON.stringify({}));
  })
  .finally(() => clearTimeout(timeout));
