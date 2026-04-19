#!/usr/bin/env bun

/**
 * PostCompact hook — context re-injection after auto-compaction.
 *
 * After Claude Code auto-compacts the context window, this hook
 * re-injects the critical task state that was saved by pre-compact.js.
 *
 * Input:  { session_id, cwd, ... }
 * Output: { additionalContext: "..." }
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

async function findCompactStateInLocalDev(cwd) {
  const localDevPath = join(cwd, ".local-development");
  if (!existsSync(localDevPath)) return null;

  let entries;
  try {
    entries = await readdir(localDevPath, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stateFile = join(localDevPath, entry.name, "compact-state.json");
    if (existsSync(stateFile)) {
      try {
        const raw = await readFile(stateFile, "utf8");
        return JSON.parse(raw);
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function findMostRecentCompactStateInTmp() {
  const tmpDir = "/tmp/task-lifecycle/compacts";
  if (!existsSync(tmpDir)) return null;

  let entries;
  try {
    entries = await readdir(tmpDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));
  if (files.length === 0) return null;

  // Pick most recently modified
  let latest = null;
  let latestMtime = 0;
  for (const file of files) {
    const filePath = join(tmpDir, file.name);
    try {
      const stat = Bun.file(filePath);
      const mtime = (await stat.stat()).mtime;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latest = filePath;
      }
    } catch {
      continue;
    }
  }

  if (!latest) return null;

  try {
    const raw = await readFile(latest, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildRestoredContext(state) {
  const taskLabel = `${state.task_id} - ${state.task_title}`;
  const filesList =
    Array.isArray(state.files_in_progress) && state.files_in_progress.length > 0
      ? state.files_in_progress.join(", ")
      : "(none recorded)";
  const recentProgress =
    state.recent_progress
      ? state.recent_progress.trim()
      : "(no progress recorded)";

  return [
    "CONTEXT RESTORED AFTER COMPACTION:",
    `Task: ${taskLabel}`,
    `Files in progress: ${filesList}`,
    `Recent progress:\n${recentProgress}`,
    "",
    "IMPORTANT: Re-read any file before editing it.",
    "Your memory of file contents may be stale.",
    "Claude Code compaction limits: max 5 files restored, 50K total budget, 5K per file.",
  ].join("\n");
}

function buildFallbackContext() {
  return [
    "CONTEXT COMPACTION DETECTED — no saved state found.",
    "To recover your position:",
    "1. Read tasks.json (.local-development/*/tasks.json) to find the in_progress task.",
    "2. Read progress.txt in the same directory to see what was last completed.",
    "3. Re-read any file you plan to edit before making changes.",
    "Your memory of file contents is likely stale after compaction.",
  ].join("\n");
}

async function main() {
  const input = JSON.parse(await Bun.stdin.text());
  const cwd = input.cwd || process.cwd();

  // Try .local-development first, then /tmp fallback
  let state = await findCompactStateInLocalDev(cwd);
  if (!state) {
    state = await findMostRecentCompactStateInTmp();
  }

  if (state) {
    console.error(
      `[post-compact] state restored: task=${state.task_id}, files=${(state.files_in_progress || []).length}`
    );
    console.log(JSON.stringify({ additionalContext: buildRestoredContext(state) }));
  } else {
    console.error("[post-compact] no compact-state.json found — using fallback context");
    console.log(JSON.stringify({ additionalContext: buildFallbackContext() }));
  }
}

main().catch((err) => {
  console.error("[post-compact] error:", err.message);
  console.log(JSON.stringify({ additionalContext: buildFallbackContext() }));
});
