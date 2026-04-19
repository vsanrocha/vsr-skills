#!/usr/bin/env bun
// PreCompact hook — saves critical task state before context is compressed

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const input = JSON.parse(await Bun.stdin.text());
const { session_id, summary } = input;
const cwd = process.cwd();

// Find tasks.json under .local-development/{taskDir}/tasks.json
function findTasksJson(baseDir) {
  const ldPath = join(baseDir, ".local-development");
  try {
    const entries = readdirSync(ldPath);
    for (const entry of entries) {
      const candidate = join(ldPath, entry, "tasks.json");
      try {
        statSync(candidate);
        return { path: candidate, taskDir: join(ldPath, entry) };
      } catch {
        // not found, try next
      }
    }
  } catch {
    // .local-development doesn't exist
  }
  return null;
}

/**
 * Find in_progress task from tasks.json
 */
function findInProgressTask(tasksPath) {
  try {
    const data = JSON.parse(readFileSync(tasksPath, "utf8"));
    return data.tasks?.find((t) => t.status === "in_progress") ?? null;
  } catch {
    return null;
  }
}

/**
 * Read last N lines of a file
 */
function readLastLines(filePath, n) {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    return lines.slice(-n).join("\n");
  } catch {
    return "";
  }
}

/**
 * Run git status --short and return list of changed files
 */
function getGitStatus(repoDir) {
  try {
    const result = Bun.spawnSync(["git", "status", "--short"], {
      cwd: repoDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = new TextDecoder().decode(result.stdout).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

// --- Main ---

const found = findTasksJson(cwd);

if (!found) {
  // No task system detected — pass through input unchanged
  console.error("[pre-compact] No tasks.json found, skipping state save");
  console.log(JSON.stringify(input));
  process.exit(0);
}

const { path: tasksPath, taskDir } = found;
const task = findInProgressTask(tasksPath);

if (!task) {
  console.error("[pre-compact] No in_progress task found, skipping state save");
  console.log(JSON.stringify(input));
  process.exit(0);
}

const filesInProgress = getGitStatus(cwd);
const progressPath = join(taskDir, "progress.txt");
const recentProgress = readLastLines(progressPath, 10);

const state = {
  timestamp: new Date().toISOString(),
  session_id: session_id ?? null,
  task_id: task.id,
  task_title: task.title,
  files_in_progress: filesInProgress,
  recent_progress: recentProgress,
  summary: summary ?? null,
};

// Save to task dir
try {
  const statePath = join(taskDir, "compact-state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  console.error(`[pre-compact] State saved to ${statePath}`);
} catch (err) {
  console.error(`[pre-compact] Failed to save to task dir: ${err.message}`);
}

// Also save to /tmp/task-lifecycle/compacts/ as fallback
try {
  const tmpDir = "/tmp/task-lifecycle/compacts";
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = join(tmpDir, `compact-state-${Date.now()}.json`);
  writeFileSync(tmpFile, JSON.stringify(state, null, 2), "utf8");
  console.error(`[pre-compact] Fallback saved to ${tmpFile}`);
} catch (err) {
  console.error(`[pre-compact] Failed to save fallback: ${err.message}`);
}

console.error(
  `[pre-compact] Task: ${task.id} | Files: ${filesInProgress.length} | State saved`
);

// Pass through input JSON unchanged
console.log(JSON.stringify(input));
