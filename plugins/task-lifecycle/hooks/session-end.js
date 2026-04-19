#!/usr/bin/env bun

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { initDb, saveSession, updateSession, DB_PATH } from "../db/learnings-db.js";

/**
 * SessionEnd hook — saves session record to learnings DB.
 * Input: { session_id, cwd }
 * Output: {} (no output needed)
 */

function detectProject(cwd) {
  if (!cwd) return null;
  const configPath = join(cwd, ".claude", "rules", "task-lifecycle-config.mdc");
  if (!existsSync(configPath)) return null;
  try {
    const content = readFileSync(configPath, "utf8");
    const match = content.match(/project[:\s]+([^\n\r]+)/i);
    if (match) return match[1].trim();
  } catch {
    // ignore read errors
  }
  // Fall back to directory name
  return cwd.split("/").pop() || null;
}

async function main() {
  const raw = await Bun.stdin.text();
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    console.error("[session-end] Failed to parse stdin JSON");
    console.log(JSON.stringify({}));
    return;
  }

  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();

  if (!sessionId) {
    console.error("[session-end] No session_id in input, skipping");
    console.log(JSON.stringify({}));
    return;
  }

  const endedAt = new Date().toISOString();
  const project = detectProject(cwd);

  try {
    const db = initDb();
    const existing = db.prepare("SELECT id, started_at FROM sessions WHERE id = ?").get(sessionId);

    if (existing) {
      const startedAt = existing.started_at;
      const durationMs = startedAt
        ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
        : null;
      updateSession(sessionId, { ended_at: endedAt, duration_ms: durationMs, project });
      const durationStr = durationMs != null ? `${Math.round(durationMs / 1000)}s` : "unknown";
      console.error(`[session-end] Session ${sessionId} closed (duration: ${durationStr}, project: ${project ?? "unknown"})`);
    } else {
      // No record from session-start — create a minimal one
      saveSession({ id: sessionId, project, started_at: endedAt, ended_at: endedAt });
      console.error(`[session-end] Session ${sessionId} saved (no start time available, project: ${project ?? "unknown"})`);
    }
  } catch (err) {
    console.error(`[session-end] Error saving session: ${err.message}`);
  }

  console.log(JSON.stringify({}));
}

main();
