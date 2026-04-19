#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DB_DIR = join(homedir(), ".task-lifecycle");
const DB_PATH = join(DB_DIR, "learnings.db");

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!existsSync(DB_DIR)) {
    mkdirSync(DB_DIR, { recursive: true });
  }
  _db = new Database(DB_PATH, { create: true });
  _db.run("PRAGMA journal_mode=WAL");
  _db.run("PRAGMA foreign_keys=ON");
  return _db;
}

function initDb() {
  const db = getDb();

  db.run(`
    CREATE TABLE IF NOT EXISTS learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT,
      category TEXT NOT NULL,
      rule TEXT NOT NULL,
      mistake TEXT,
      correction TEXT,
      source TEXT DEFAULT 'manual',
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(
      rule, mistake, correction, category, project,
      content='learnings',
      content_rowid='id'
    )
  `);

  // Keep FTS index in sync with the learnings table
  db.run(`
    CREATE TRIGGER IF NOT EXISTS learnings_ai AFTER INSERT ON learnings BEGIN
      INSERT INTO learnings_fts(rowid, rule, mistake, correction, category, project)
      VALUES (new.id, new.rule, new.mistake, new.correction, new.category, new.project);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS learnings_ad AFTER DELETE ON learnings BEGIN
      INSERT INTO learnings_fts(learnings_fts, rowid, rule, mistake, correction, category, project)
      VALUES ('delete', old.id, old.rule, old.mistake, old.correction, old.category, old.project);
    END
  `);

  db.run(`
    CREATE TRIGGER IF NOT EXISTS learnings_au AFTER UPDATE ON learnings BEGIN
      INSERT INTO learnings_fts(learnings_fts, rowid, rule, mistake, correction, category, project)
      VALUES ('delete', old.id, old.rule, old.mistake, old.correction, old.category, old.project);
      INSERT INTO learnings_fts(rowid, rule, mistake, correction, category, project)
      VALUES (new.id, new.rule, new.mistake, new.correction, new.category, new.project);
    END
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project TEXT,
      task_id TEXT,
      edits INTEGER DEFAULT 0,
      corrections INTEGER DEFAULT 0,
      prompts INTEGER DEFAULT 0,
      cost_usd REAL,
      tokens_total INTEGER,
      duration_ms INTEGER,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    )
  `);

  return db;
}

function addLearning({ project, category, rule, mistake, correction, source = "manual", session_id } = {}) {
  if (!category || !rule) throw new Error("category and rule are required");
  const db = initDb();
  const stmt = db.prepare(`
    INSERT INTO learnings (project, category, rule, mistake, correction, source, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(project ?? null, category, rule, mistake ?? null, correction ?? null, source, session_id ?? null);
  return result.lastInsertRowid;
}

function searchLearnings(query, limit = 5) {
  if (!query) return [];
  const db = initDb();
  const rows = db.prepare(`
    SELECT l.id, l.project, l.category, l.rule, l.mistake, l.correction, l.source, l.session_id, l.created_at
    FROM learnings_fts
    JOIN learnings l ON l.id = learnings_fts.rowid
    WHERE learnings_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit);
  return rows;
}

function getRecentLearnings(project, limit = 5) {
  const db = initDb();
  if (project) {
    return db.prepare(`
      SELECT id, project, category, rule, mistake, correction, source, session_id, created_at
      FROM learnings
      WHERE project = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(project, limit);
  }
  return db.prepare(`
    SELECT id, project, category, rule, mistake, correction, source, session_id, created_at
    FROM learnings
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

function saveSession({ id, project, task_id, edits, corrections, prompts, cost_usd, tokens_total, duration_ms, started_at, ended_at } = {}) {
  if (!id) throw new Error("session id is required");
  const db = initDb();
  db.prepare(`
    INSERT OR REPLACE INTO sessions (id, project, task_id, edits, corrections, prompts, cost_usd, tokens_total, duration_ms, started_at, ended_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    project ?? null,
    task_id ?? null,
    edits ?? 0,
    corrections ?? 0,
    prompts ?? 0,
    cost_usd ?? null,
    tokens_total ?? null,
    duration_ms ?? null,
    started_at ?? new Date().toISOString(),
    ended_at ?? null
  );
}

function updateSession(id, updates = {}) {
  if (!id) throw new Error("session id is required");
  const db = initDb();
  const allowed = ["project", "task_id", "edits", "corrections", "prompts", "cost_usd", "tokens_total", "duration_ms", "started_at", "ended_at"];
  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return;
  const setClauses = fields.map(f => `${f} = ?`).join(", ");
  const values = fields.map(f => updates[f]);
  db.prepare(`UPDATE sessions SET ${setClauses} WHERE id = ?`).run(...values, id);
}

const PROJECT_CATEGORIES = new Set(["Architecture", "Testing", "Quality", "Git", "Performance"]);
const USER_CATEGORIES = new Set(["Navigation", "Editing", "Context"]);

function isProjectCategory(category) {
  return PROJECT_CATEGORIES.has(category);
}

/**
 * Export project-scoped learnings to a JSON file at {projectPath}/.task-lifecycle/learnings.json.
 * Only exports learnings whose category is in PROJECT_CATEGORIES.
 */
function exportToJson(projectPath) {
  if (!projectPath) throw new Error("projectPath is required");

  const db = initDb();
  const rows = db.prepare(`
    SELECT id, project, category, rule, mistake, correction, source, session_id, created_at
    FROM learnings
    WHERE category IN (${[...PROJECT_CATEGORIES].map(() => "?").join(", ")})
    ORDER BY created_at ASC
  `).all(...PROJECT_CATEGORIES);

  const outDir = join(projectPath, ".task-lifecycle");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const outPath = join(outDir, "learnings.json");
  const payload = {
    version: 1,
    exported_at: new Date().toISOString(),
    learnings: rows.map(r => ({
      category: r.category,
      rule: r.rule,
      mistake: r.mistake ?? null,
      correction: r.correction ?? null,
      source: r.source,
      created_at: r.created_at,
    })),
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return { path: outPath, count: rows.length };
}

/**
 * Import learnings from {projectPath}/.task-lifecycle/learnings.json into the DB.
 * Skips duplicates by matching (category, rule) pairs already present.
 */
function importFromJson(projectPath) {
  if (!projectPath) throw new Error("projectPath is required");

  const jsonPath = join(projectPath, ".task-lifecycle", "learnings.json");
  if (!existsSync(jsonPath)) return { imported: 0, skipped: 0 };

  const raw = readFileSync(jsonPath, "utf8");
  const data = JSON.parse(raw);
  if (!data.learnings || !Array.isArray(data.learnings)) return { imported: 0, skipped: 0 };

  const db = initDb();
  const existing = db.prepare(`
    SELECT category, rule FROM learnings
    WHERE category IN (${[...PROJECT_CATEGORIES].map(() => "?").join(", ")})
  `).all(...PROJECT_CATEGORIES);

  const existingSet = new Set(existing.map(r => `${r.category}::${r.rule}`));

  let imported = 0;
  let skipped = 0;

  const insert = db.prepare(`
    INSERT INTO learnings (project, category, rule, mistake, correction, source, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const project = projectPath.split("/").filter(Boolean).pop() ?? null;

  for (const l of data.learnings) {
    if (!l.category || !l.rule) { skipped++; continue; }
    if (!isProjectCategory(l.category)) { skipped++; continue; }

    const key = `${l.category}::${l.rule}`;
    if (existingSet.has(key)) { skipped++; continue; }

    insert.run(project, l.category, l.rule, l.mistake ?? null, l.correction ?? null, l.source ?? "json-import", null);
    existingSet.add(key);
    imported++;
  }

  return { imported, skipped };
}

export {
  initDb, addLearning, searchLearnings, getRecentLearnings,
  saveSession, updateSession, DB_PATH,
  isProjectCategory, exportToJson, importFromJson,
  PROJECT_CATEGORIES, USER_CATEGORIES,
};
