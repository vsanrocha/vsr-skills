#!/usr/bin/env bun

// UserPromptSubmit hook
// Tracks if work is drifting from the original task intent.
// On first prompt: captures intent keywords and saves them to /tmp.
// On subsequent prompts: compares keywords and warns if overlap drops below 20%
// after 6+ prompts. Reset patterns ('now let's', 'switch to', etc.) clear tracking.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const TIMEOUT_MS = 5000;
const DRIFT_THRESHOLD = 0.20;   // 20% keyword overlap minimum
const MIN_PROMPTS_BEFORE_WARN = 6;
const TMP_DIR = "/tmp/task-lifecycle";

// Patterns that signal the user intentionally wants to switch context
const RESET_PATTERNS = [
  /now let['']s\b/i,
  /\bswitch to\b/i,
  /\bforget it\b/i,
  /\bnew task\b/i,
  /\bstart over\b/i,
  /\bdifferent task\b/i,
  /\bchange of plans?\b/i,
];

// Common English stop words — excluded from keyword extraction
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "shall", "can", "need", "must",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us",
  "them", "my", "your", "his", "its", "our", "their", "this", "that",
  "these", "those", "what", "which", "who", "how", "when", "where", "why",
  "if", "then", "else", "so", "as", "not", "no", "yes", "just", "also",
  "very", "too", "more", "some", "any", "all", "both", "each", "few",
  "please", "make", "create", "add", "update", "use", "get", "set",
  "run", "want", "like", "go", "let", "ok", "okay",
]);

/**
 * Extracts meaningful keywords from a text string.
 * Keeps words >= 3 chars that are not stop words.
 */
function extractKeywords(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  return [...new Set(words)];
}

/**
 * Jaccard similarity between two keyword arrays.
 * Returns a value between 0 (no overlap) and 1 (identical sets).
 */
function keywordOverlap(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Builds a short human-readable summary from a keyword array.
 * Uses first 6 keywords joined with commas.
 */
function summarize(keywords) {
  return keywords.slice(0, 6).join(", ") || "(unknown)";
}

// ─── Main ───────────────────────────────────────────────────────────────────

const rawInput = await Bun.stdin.text();
let input;
try {
  input = JSON.parse(rawInput);
} catch {
  console.log(JSON.stringify({}));
  process.exit(0);
}

const prompt = input?.prompt ?? "";
const sessionId = input?.session_id ?? "default";

if (!prompt.trim()) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Ensure tmp directory exists
if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR, { recursive: true });
}

const intentFile = `${TMP_DIR}/intent-${sessionId}.json`;

// ─── Reset detection ─────────────────────────────────────────────────────────

const isReset = RESET_PATTERNS.some((re) => re.test(prompt));

if (isReset) {
  // Clear tracking so the next prompt becomes the new "first prompt"
  if (existsSync(intentFile)) {
    try {
      Bun.file(intentFile).delete?.();
    } catch {
      // Best-effort; if delete isn't available, overwrite below
      writeFileSync(intentFile, JSON.stringify({ reset: true }));
    }
  }
  console.error(`[drift-detector] Reset pattern detected — clearing intent tracking`);
  console.log(JSON.stringify({}));
  process.exit(0);
}

// ─── First prompt — capture intent ───────────────────────────────────────────

if (!existsSync(intentFile)) {
  const keywords = extractKeywords(prompt);
  const state = {
    keywords,
    summary: summarize(keywords),
    prompt_count: 1,
    warned: false,
  };
  writeFileSync(intentFile, JSON.stringify(state));
  console.error(`[drift-detector] Intent captured: ${state.summary}`);
  console.log(JSON.stringify({}));
  process.exit(0);
}

// ─── Subsequent prompts — compare and possibly warn ──────────────────────────

let state;
try {
  state = JSON.parse(readFileSync(intentFile, "utf8"));
} catch {
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Handle case where file was written as a reset marker
if (state.reset) {
  const keywords = extractKeywords(prompt);
  const newState = {
    keywords,
    summary: summarize(keywords),
    prompt_count: 1,
    warned: false,
  };
  writeFileSync(intentFile, JSON.stringify(newState));
  console.log(JSON.stringify({}));
  process.exit(0);
}

state.prompt_count = (state.prompt_count ?? 0) + 1;

const currentKeywords = extractKeywords(prompt);
const overlap = keywordOverlap(state.keywords, currentKeywords);

console.error(
  `[drift-detector] prompt #${state.prompt_count} overlap=${(overlap * 100).toFixed(0)}% threshold=${(DRIFT_THRESHOLD * 100).toFixed(0)}%`
);

let additionalContext;

if (
  state.prompt_count >= MIN_PROMPTS_BEFORE_WARN &&
  overlap < DRIFT_THRESHOLD &&
  !state.warned
) {
  state.warned = true;
  additionalContext =
    `⚠️ You may be drifting from the original task. ` +
    `Original intent: "${state.summary}". ` +
    `Consider wrapping up the current work or starting a new task before continuing.`;
  console.error(`[drift-detector] Drift warning triggered`);
} else if (state.warned && overlap >= DRIFT_THRESHOLD) {
  // Back on track — reset warning flag
  state.warned = false;
}

// Persist updated state
writeFileSync(intentFile, JSON.stringify(state));

if (additionalContext) {
  console.log(JSON.stringify({ additionalContext }));
} else {
  console.log(JSON.stringify({}));
}
