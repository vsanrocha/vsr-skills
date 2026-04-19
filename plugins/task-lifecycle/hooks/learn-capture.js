#!/usr/bin/env bun

/**
 * learn-capture.js — Stop hook
 *
 * Extracts [LEARN] blocks from the assistant's last message and persists
 * them to the learnings database. This hook NEVER blocks the stop event;
 * it only captures knowledge as a side-effect.
 *
 * Supported pattern (multiline friendly):
 *   [LEARN] <category>: <rule>
 *   Mistake: <text>          (optional)
 *   Correction: <text>       (optional)
 *
 * Requires Claude Code ≥ 2.1.49 (last_assistant_message field in Stop hook input).
 */

import { addLearning, isProjectCategory, exportToJson } from "../db/learnings-db.js";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DB_PATH = join(homedir(), ".task-lifecycle", "learnings.db");

/**
 * Try to detect the current project name from the cwd.
 * Falls back to the last directory component.
 */
function detectProject(cwd) {
  if (!cwd) return null;
  try {
    const configPath = join(cwd, ".claude", "rules", "task-lifecycle-config.mdc");
    if (existsSync(configPath)) {
      const content = Bun.file(configPath).text();
      const match = content.toString().match(/project[:\s]+([^\s\n]+)/i);
      if (match) return match[1];
    }
  } catch {
    // ignore
  }
  return cwd.split("/").filter(Boolean).pop() ?? null;
}

/**
 * Parse [LEARN] blocks from a text string.
 * Returns an array of { category, rule, mistake, correction } objects.
 *
 * Grammar:
 *   [LEARN] <category>: <rule text (rest of line)>
 *   Mistake: <text>       (optional, next non-empty line(s))
 *   Correction: <text>    (optional, next non-empty line(s))
 */
function extractLearnings(text) {
  if (!text) return [];

  const learnings = [];

  // Split by [LEARN] markers (case-sensitive per spec)
  const learnPattern = /\[LEARN\]\s+([^:]+):\s*(.+)/g;
  let match;

  while ((match = learnPattern.exec(text)) !== null) {
    const category = match[1].trim();
    const rule = match[2].trim();

    // Look ahead in the text after this match for optional Mistake/Correction lines
    const afterMatch = text.slice(match.index + match[0].length);
    const lines = afterMatch.split("\n");

    let mistake = null;
    let correction = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Stop consuming if we hit another [LEARN] block or an unrelated line
      if (trimmed.startsWith("[LEARN]")) break;

      const mistakeMatch = trimmed.match(/^Mistake:\s*(.+)/i);
      if (mistakeMatch) {
        mistake = mistakeMatch[1].trim();
        continue;
      }

      const correctionMatch = trimmed.match(/^Correction:\s*(.+)/i);
      if (correctionMatch) {
        correction = correctionMatch[1].trim();
        continue;
      }

      // Any other non-empty line that is not Mistake/Correction means we're done
      // with this learning block's optional fields
      break;
    }

    if (category && rule) {
      learnings.push({ category, rule, mistake, correction });
    }
  }

  return learnings;
}

async function main() {
  let input;
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch (err) {
    console.error("[learn-capture] Failed to parse stdin JSON:", err.message);
    console.log(JSON.stringify({}));
    return;
  }

  // Safety: if stop_hook_active is true, a previous hook already blocked once.
  // We don't block here at all, but keep this check for future-proofing.
  const { last_assistant_message, session_id, cwd } = input;

  if (!last_assistant_message) {
    // No message to scan (older Claude Code version or unexpected input)
    console.log(JSON.stringify({}));
    return;
  }

  const learnings = extractLearnings(last_assistant_message);

  if (learnings.length === 0) {
    console.log(JSON.stringify({}));
    return;
  }

  // Skip DB writes if the database doesn't exist yet (first-run / no T1 installed)
  if (!existsSync(DB_PATH)) {
    console.error(`[learn-capture] DB not found at ${DB_PATH}, skipping persist`);
    console.log(JSON.stringify({}));
    return;
  }

  const project = detectProject(cwd);
  let saved = 0;
  let projectLearningsChanged = false;

  for (const { category, rule, mistake, correction } of learnings) {
    try {
      addLearning({ project, category, rule, mistake, correction, source: "learn-capture", session_id });
      saved++;
      if (isProjectCategory(category)) {
        projectLearningsChanged = true;
      }
    } catch (err) {
      console.error(`[learn-capture] Failed to save learning "${rule}":`, err.message);
    }
  }

  // If any project-category learnings were captured, export to JSON for committing
  if (projectLearningsChanged && cwd) {
    try {
      const result = exportToJson(cwd);
      console.error(`[learn-capture] Exported ${result.count} project learnings to ${result.path}`);
    } catch (err) {
      console.error(`[learn-capture] Failed to export project learnings:`, err.message);
    }
  }

  console.error(`[learn-capture] Captured ${saved}/${learnings.length} learning(s)`);
  console.log(JSON.stringify({}));
}

main().catch((err) => {
  console.error("[learn-capture] Unexpected error:", err.message);
  console.log(JSON.stringify({}));
});
