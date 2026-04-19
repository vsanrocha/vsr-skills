#!/usr/bin/env bun

/**
 * Task-Lifecycle Doctor — health check diagnostic for the task-lifecycle plugin.
 * Exits 0 if no errors (warnings OK), exits 1 if any errors found.
 * Read-only. Works from any directory.
 */

import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");
const HOME = process.env.HOME || "";
const DB_PATH = `${HOME}/.task-lifecycle/learnings.db`;

// ANSI colors
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  reset: (s) => `\x1b[0m${s}\x1b[0m`,
};

let passed = 0;
let warnings = 0;
let errors = 0;

function ok(msg) {
  passed++;
  console.log(`  ${c.green("✅")} ${msg}`);
}

function warn(msg) {
  warnings++;
  console.log(`  ${c.yellow("⚠️ ")} ${msg}`);
}

function fail(msg) {
  errors++;
  console.log(`  ${c.red("❌")} ${msg}`);
}

function section(name) {
  console.log(`\n${c.bold(name)}:`);
}

// Attempt to get a tool's version string; returns null on failure.
function getVersion(cmd) {
  try {
    const r = Bun.spawnSync([cmd, "--version"], { stderr: "pipe" });
    if (r.exitCode === 0) {
      return r.stdout.toString().trim().split("\n")[0];
    }
    // Some tools (claude) use different flags
    const r2 = Bun.spawnSync([cmd, "version"], { stderr: "pipe" });
    if (r2.exitCode === 0) {
      return r2.stdout.toString().trim().split("\n")[0];
    }
  } catch (_) {}
  return null;
}

// ─── 1. Plugin installation ──────────────────────────────────────────────────
section("Plugin");

const manifestPath = resolve(PLUGIN_ROOT, ".claude-plugin", "plugin.json");
if (!existsSync(manifestPath)) {
  warn("plugin.json not found (plugin manifest missing)");
} else {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const missing = ["name", "version", "description"].filter((f) => !manifest[f]);
    if (missing.length > 0) {
      fail(`plugin.json missing required fields: ${missing.join(", ")}`);
    } else {
      ok(`plugin.json valid (v${manifest.version})`);
    }
  } catch (e) {
    fail(`plugin.json is not valid JSON: ${e.message}`);
  }
}

// ─── 2. Hooks ────────────────────────────────────────────────────────────────
const hooksJsonPath = resolve(PLUGIN_ROOT, "hooks", "hooks.json");
const hooksDir = resolve(PLUGIN_ROOT, "hooks");

if (!existsSync(hooksJsonPath)) {
  warn("hooks/hooks.json not found");
  // Fall back: count .js files in hooks/
  if (existsSync(hooksDir)) {
    const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith(".js"));
    if (hookFiles.length > 0) {
      ok(`${hookFiles.length} hook scripts present in hooks/`);
    } else {
      warn("No hook scripts found in hooks/");
    }
  } else {
    fail("hooks/ directory not found");
  }
} else {
  try {
    const hooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf8"));
    // Support both array or object-of-arrays formats
    const scripts = Array.isArray(hooksJson)
      ? hooksJson
      : Object.values(hooksJson).flat().filter((v) => typeof v === "string");
    const missing = scripts.filter((s) => !existsSync(resolve(PLUGIN_ROOT, s)));
    if (missing.length > 0) {
      warn(`${missing.length} hook script(s) missing: ${missing.join(", ")}`);
    } else {
      ok(`${scripts.length} hooks registered, all scripts present`);
    }
  } catch (e) {
    fail(`hooks/hooks.json is not valid JSON: ${e.message}`);
  }
}

// ─── 3. Database ─────────────────────────────────────────────────────────────
section("Database");

if (!existsSync(DB_PATH)) {
  warn("learnings.db not found — run /setup-task-lifecycle to initialize");
} else {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const learnings = db.query("SELECT COUNT(*) as count FROM learnings").get();
    const sessions = db.query("SELECT COUNT(*) as count FROM sessions").get();
    db.close();
    ok(`learnings.db exists (${learnings.count} learnings, ${sessions.count} sessions)`);
  } catch (e) {
    fail(`learnings.db not queryable: ${e.message}`);
  }
}

// ─── 4. Dependencies ─────────────────────────────────────────────────────────
section("Dependencies");

const requiredDeps = ["bun", "git", "claude"];
const optionalDeps = {
  gh: "GitHub source unavailable",
  glab: "GitLab source unavailable",
  docker: "container execution unavailable",
};

for (const dep of requiredDeps) {
  const which = Bun.spawnSync(["which", dep], { stderr: "pipe" });
  if (which.exitCode === 0) {
    const version = getVersion(dep);
    ok(version ? `${dep} ${version}` : `${dep} found`);
  } else {
    fail(`${dep} not found (required)`);
  }
}

for (const [dep, hint] of Object.entries(optionalDeps)) {
  const which = Bun.spawnSync(["which", dep], { stderr: "pipe" });
  if (which.exitCode === 0) {
    const version = getVersion(dep);
    ok(version ? `${dep} ${version}` : `${dep} found`);
  } else {
    warn(`${dep} not found (${hint})`);
  }
}

// ─── 5. Project config ───────────────────────────────────────────────────────
section("Project Config");

const CONFIG_REL = ".claude/rules/task-lifecycle-config.mdc";
let configPath = null;

// Walk up from cwd until we find it or hit the filesystem root
let checkDir = process.cwd();
for (let i = 0; i < 12; i++) {
  const candidate = resolve(checkDir, CONFIG_REL);
  if (existsSync(candidate)) {
    configPath = candidate;
    break;
  }
  const parent = resolve(checkDir, "..");
  if (parent === checkDir) break;
  checkDir = parent;
}

if (!configPath) {
  warn(`${CONFIG_REL} not found — project-level config missing`);
} else {
  const content = readFileSync(configPath, "utf8");
  const placeholders = [
    /\(describe\b/i,
    /\(fill in\b/i,
    /\(required\b/i,
    /\(optional\b/i,
    /\bTODO\b/,
    /\bN\/A\b/,
    /\bPLACEHOLDER\b/i,
  ];
  const unfilled = placeholders.filter((p) => p.test(content));
  if (unfilled.length > 0) {
    warn("task-lifecycle-config.mdc has unfilled placeholder values");
  } else {
    ok("task-lifecycle-config.mdc found and configured");
  }
}

// ─── 6. Rules ────────────────────────────────────────────────────────────────
section("Rules");

const rulesDir = resolve(PLUGIN_ROOT, "rules");
const expectedRules = [
  { dir: "agent-quality-standards", file: "agent-quality-standards.mdc" },
  { dir: "ralph-execution", file: "ralph-execution.mdc" },
];

for (const rule of expectedRules) {
  const filePath = resolve(rulesDir, rule.dir, rule.file);
  if (existsSync(filePath)) {
    ok(rule.file);
  } else {
    warn(`${rule.file} not found`);
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
const resultMsg = `Result: ${passed} passed, ${warnings} warnings, ${errors} errors`;
if (errors > 0) {
  console.log(c.red(resultMsg));
} else if (warnings > 0) {
  console.log(c.yellow(resultMsg));
} else {
  console.log(c.green(resultMsg));
}

process.exit(errors > 0 ? 1 : 0);
