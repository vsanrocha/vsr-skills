#!/usr/bin/env bun
// install.js — Task-Lifecycle installer
// Idempotent. Safe to run multiple times.
//
// Usage:
//   bun install.js                 # enable for current project (default)
//   bun install.js --scope global  # enable for all projects
//
// What it does:
//   1. Copies db/ → ~/.claude/hooks/db/
//   2. Copies scripts → ~/.agents/scripts/
//   3. Registers plugin in enabledPlugins (project or global)
//   4. Registers marketplace in extraKnownMarketplaces (always global)

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

const HOME = homedir();
const PLUGIN_ROOT = dirname(import.meta.dir);

const pluginJson = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf-8"));
const PLUGIN_VERSION = pluginJson.version;

const MARKETPLACE_ID = "vsr-skills";
const PLUGIN_ID = "task-lifecycle";
const PLUGIN_KEY = `${MARKETPLACE_ID}@${PLUGIN_ID}`;
const MARKETPLACE_URL = "https://github.com/vsanrocha/vsr-skills.git";

const GLOBAL_SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const INSTALLED_PLUGINS_PATH = join(HOME, ".claude", "plugins", "installed_plugins.json");
const DB_DEST = join(HOME, ".claude", "hooks", "db");
const SCRIPTS_DEST = join(HOME, ".agents", "scripts");

// ── Args ──────────────────────────────────────────────────────────────────────

const scopeIdx = process.argv.indexOf("--scope");
const scope = scopeIdx !== -1 ? process.argv[scopeIdx + 1] : "project";

if (!["project", "global"].includes(scope)) {
  console.error(`  ✗ Invalid --scope "${scope}". Use: project | global`);
  process.exit(1);
}

const PROJECT_SETTINGS_PATH = join(process.cwd(), ".claude", "settings.json");
const SETTINGS_PATH = scope === "global" ? GLOBAL_SETTINGS_PATH : PROJECT_SETTINGS_PATH;

console.log(`\nTask-Lifecycle v${PLUGIN_VERSION} — scope: ${scope}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

function loadJson(p) {
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function saveJson(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function log(status, msg) {
  const icon = status === "ok" ? "✓" : status === "skip" ? "–" : "✗";
  console.log(`  ${icon} ${msg}`);
}

// ── Step 1: Copy db ───────────────────────────────────────────────────────────

console.log("\n[1/4] Copying db/ → ~/.claude/hooks/db/");
const dbDir = join(PLUGIN_ROOT, "db");
if (existsSync(dbDir)) {
  ensureDir(DB_DEST);
  for (const file of readdirSync(dbDir)) {
    const dest = join(DB_DEST, file);
    if (existsSync(dest)) { log("skip", `${file} (already exists)`); continue; }
    copyFileSync(join(dbDir, file), dest);
    log("ok", file);
  }
} else {
  log("skip", "no db/ directory");
}

// ── Step 2: Copy scripts ──────────────────────────────────────────────────────

console.log("\n[2/4] Copying scripts → ~/.agents/scripts/");
ensureDir(SCRIPTS_DEST);
const scriptsDir = join(PLUGIN_ROOT, "scripts");
for (const file of readdirSync(scriptsDir)) {
  if (file === "install.js") continue;
  copyFileSync(join(scriptsDir, file), join(SCRIPTS_DEST, file));
  log("ok", file);
}

// ── Step 3: Register enabledPlugins ──────────────────────────────────────────

const settingsLabel = scope === "global" ? "~/.claude/settings.json" : ".claude/settings.json";
console.log(`\n[3/4] Registering enabledPlugins → ${settingsLabel}`);

if (scope === "project") ensureDir(join(process.cwd(), ".claude"));
const settings = loadJson(SETTINGS_PATH) || {};
if (!settings.enabledPlugins) settings.enabledPlugins = {};

if (settings.enabledPlugins[PLUGIN_KEY]) {
  log("skip", `${PLUGIN_KEY} already enabled`);
} else {
  settings.enabledPlugins[PLUGIN_KEY] = true;
  log("ok", `enabledPlugins → ${PLUGIN_KEY}`);
}
saveJson(SETTINGS_PATH, settings);

// ── Step 4: Register marketplace (always global) ──────────────────────────────

console.log("\n[4/4] Registering marketplace → ~/.claude/settings.json");
const globalSettings = scope === "global" ? settings : (loadJson(GLOBAL_SETTINGS_PATH) || {});
if (!globalSettings.extraKnownMarketplaces) globalSettings.extraKnownMarketplaces = {};

if (globalSettings.extraKnownMarketplaces[MARKETPLACE_ID]) {
  log("skip", `${MARKETPLACE_ID} already in extraKnownMarketplaces`);
} else {
  globalSettings.extraKnownMarketplaces[MARKETPLACE_ID] = {
    source: { source: "git", url: MARKETPLACE_URL }
  };
  log("ok", `extraKnownMarketplaces → ${MARKETPLACE_ID}`);
}

const installed = loadJson(INSTALLED_PLUGINS_PATH) || { version: 2, plugins: {} };
installed.plugins[PLUGIN_KEY] = [{
  scope: scope === "global" ? "user" : "project",
  installPath: PLUGIN_ROOT,
  version: PLUGIN_VERSION,
  installedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
}];

if (scope !== "global") saveJson(GLOBAL_SETTINGS_PATH, globalSettings);
saveJson(INSTALLED_PLUGINS_PATH, installed);
log("ok", `installed_plugins.json → ${PLUGIN_KEY}@${PLUGIN_VERSION}`);

// ── Done ──────────────────────────────────────────────────────────────────────

console.log(`
╔═══════════════════════════════════════════════╗
║  Task-Lifecycle v${PLUGIN_VERSION} installed (${scope})  ║
║  Restart Claude Code to load hooks/skills.    ║
╚═══════════════════════════════════════════════╝
`);
