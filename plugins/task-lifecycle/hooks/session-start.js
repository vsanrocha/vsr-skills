#!/usr/bin/env bun

/**
 * SessionStart hook — loads recent learnings and previous session stats
 * into Claude's context at the beginning of each session.
 *
 * Input:  { session_id, cwd }
 * Output: { additionalContext: "..." }
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const input = JSON.parse(await Bun.stdin.text());
const cwd = input.cwd ?? process.cwd();

/**
 * Detect project name from .claude/rules/task-lifecycle-config.mdc
 * Looks for a line like: project: my-project or project_name: my-project
 */
function detectProject(cwd) {
  const configPaths = [
    join(cwd, ".claude", "rules", "task-lifecycle-config.mdc"),
    join(cwd, ".claude", "rules", "task-lifecycle-config"),
  ];

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;
    try {
      const content = readFileSync(configPath, "utf8");
      const match = content.match(/^project(?:_name)?:\s*(.+)$/im);
      if (match) return match[1].trim();
    } catch {
      // silently skip
    }
  }

  // Fallback: use the directory name as project identifier
  return null;
}

/**
 * Load project learnings from {cwd}/.task-lifecycle/learnings.json.
 * Returns an array of learning objects.
 */
function loadProjectLearnings(cwd) {
  const jsonPath = join(cwd, ".task-lifecycle", "learnings.json");
  if (!existsSync(jsonPath)) return [];
  try {
    const raw = readFileSync(jsonPath, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.learnings) ? data.learnings : [];
  } catch {
    return [];
  }
}

/**
 * Check if project JSON is newer than a cached timestamp.
 * Used to decide whether to reimport project learnings into the DB.
 */
function projectJsonIsNewer(cwd, lastImportMs) {
  const jsonPath = join(cwd, ".task-lifecycle", "learnings.json");
  if (!existsSync(jsonPath)) return false;
  try {
    const mtime = statSync(jsonPath).mtimeMs;
    return mtime > lastImportMs;
  } catch {
    return false;
  }
}

async function main() {
  const project = detectProject(cwd);

  // Dynamically import learnings-db — if it fails (DB doesn't exist), skip silently
  let getRecentLearnings, initDb, importFromJson;
  try {
    const db = await import("../db/learnings-db.js");
    getRecentLearnings = db.getRecentLearnings;
    initDb = db.initDb;
    importFromJson = db.importFromJson;
  } catch {
    console.error("[session-start] learnings-db not available, skipping");
    console.log(JSON.stringify({}));
    return;
  }

  let learnings = [];
  let previousSession = null;

  try {
    initDb();
  } catch {
    console.log(JSON.stringify({}));
    return;
  }

  // Reimport project learnings from JSON if the file is newer than a cache marker
  const cacheMarkerPath = join(cwd, ".task-lifecycle", ".last-import-ts");
  let lastImportMs = 0;
  if (existsSync(cacheMarkerPath)) {
    try {
      lastImportMs = Number(readFileSync(cacheMarkerPath, "utf8").trim()) || 0;
    } catch { /* ignore */ }
  }

  if (projectJsonIsNewer(cwd, lastImportMs)) {
    try {
      const result = importFromJson(cwd);
      console.error(`[session-start] reimported project learnings: ${result.imported} new, ${result.skipped} skipped`);
      // Update cache marker
      const markerDir = join(cwd, ".task-lifecycle");
      const { writeFileSync: wf, mkdirSync: md } = await import("fs");
      if (!existsSync(markerDir)) md(markerDir, { recursive: true });
      wf(cacheMarkerPath, String(Date.now()), "utf8");
    } catch (err) {
      console.error(`[session-start] failed to reimport project learnings:`, err.message);
    }
  }

  // Load from DB (user learnings + any imported project learnings)
  try {
    learnings = getRecentLearnings(project, 5);
  } catch {
    // silently skip
  }

  // Also load project learnings directly from JSON (in case DB import was skipped)
  const projectLearnings = loadProjectLearnings(cwd);

  // Fetch previous session stats from sessions table
  try {
    const { DB_PATH } = await import("../db/learnings-db.js");
    if (existsSync(DB_PATH)) {
      const { Database } = await import("bun:sqlite");
      const db = new Database(DB_PATH, { readonly: true });
      const row = db.prepare(`
        SELECT id, project, task_id, edits, corrections, prompts, cost_usd, tokens_total, duration_ms, started_at, ended_at
        FROM sessions
        WHERE ended_at IS NOT NULL
        ORDER BY ended_at DESC
        LIMIT 1
      `).get();
      if (row) previousSession = row;
      db.close();
    }
  } catch {
    // silently skip
  }

  // Merge: DB learnings + project JSON learnings (deduplicate by category+rule)
  const seen = new Set(learnings.map(l => `${l.category}::${l.rule}`));
  const mergedProjectLearnings = projectLearnings
    .filter(l => !seen.has(`${l.category}::${l.rule}`))
    .slice(0, 5);

  const allLearnings = [...learnings, ...mergedProjectLearnings].slice(0, 10);

  console.error(`[session-start] loaded ${allLearnings.length} learnings (${learnings.length} from DB, ${mergedProjectLearnings.length} from project JSON)${project ? ` for project "${project}"` : ""}`);
  if (previousSession) {
    const durationSec = previousSession.duration_ms ? Math.round(previousSession.duration_ms / 1000) : null;
    console.error(
      `[session-start] last session: ${previousSession.id.slice(0, 8)}...` +
      (previousSession.task_id ? ` task=${previousSession.task_id}` : "") +
      (durationSec != null ? ` duration=${durationSec}s` : "") +
      (previousSession.edits != null ? ` edits=${previousSession.edits}` : "") +
      (previousSession.cost_usd != null ? ` cost=$${previousSession.cost_usd.toFixed(4)}` : "")
    );
  }

  if (allLearnings.length === 0) {
    console.log(JSON.stringify({}));
    return;
  }

  const bullets = allLearnings.map((l) => {
    let line = `- [${l.category}] ${l.rule}`;
    if (l.mistake) line += `\n  Mistake: ${l.mistake}`;
    if (l.correction) line += `\n  Correction: ${l.correction}`;
    return line;
  });

  const projectLabel = project ? ` for "${project}"` : "";
  const additionalContext = [
    `## Learnings from previous sessions${projectLabel}`,
    "",
    ...bullets,
    "",
    "Apply these learnings throughout this session.",
  ].join("\n");

  console.log(JSON.stringify({ additionalContext }));
}

await main();
