#!/usr/bin/env bun
// install.js — Task-Lifecycle v2 installer
// Idempotent. Safe to run multiple times.
// Usage: bun install.js [--marketplace <path>]
//
// What it does:
//   1. Copies hooks → ~/.claude/hooks/task-lifecycle/
//   2. Copies db/   → ~/.claude/hooks/db/
//   3. Copies scripts → ~/.agents/scripts/
//   4. Registers hooks in ~/.claude/settings.json
//   5. Registers plugin in enabledPlugins + extraKnownMarketplaces
//   6. Updates installed_plugins.json
//   7. Syncs skills to plugin cache

import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, dirname, basename } from "path";
import { homedir } from "os";

const HOME = homedir();
const PLUGIN_ROOT = dirname(import.meta.dir); // plugins/task-lifecycle
const MARKETPLACE_ROOT = join(PLUGIN_ROOT, "../.."); // repo root
const SETTINGS_PATH = join(HOME, ".claude", "settings.json");
const INSTALLED_PLUGINS_PATH = join(HOME, ".claude", "plugins", "installed_plugins.json");

const HOOKS_DEST = join(HOME, ".claude", "hooks", "task-lifecycle");
const DB_DEST = join(HOME, ".claude", "hooks", "db");
const SCRIPTS_DEST = join(HOME, ".agents", "scripts");
const SKILLS_CACHE = join(HOME, ".claude", "plugins", "cache", "management-ai-helper", "management-ai-helper", "1.0.0");

const REPO_URL = "git@gitlab.com:onflylabs/general/microservicos/core/management-ai-helper.git";
const REPO_REF = "feat/task-lifecycle-v2-adversarial-harness";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

function copyDir(src, dest) {
  ensureDir(dest);
  for (const file of readdirSync(src)) {
    const srcPath = join(src, file);
    const destPath = join(dest, file);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

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

// ── Step 1: Copy hooks ────────────────────────────────────────────────────────

console.log("\n[1/7] Copying hooks → ~/.claude/hooks/task-lifecycle/");
ensureDir(HOOKS_DEST);
const hooksDir = join(PLUGIN_ROOT, "hooks");
for (const file of readdirSync(hooksDir)) {
  if (!file.endsWith(".js") && file !== "hooks.json") continue;
  copyFileSync(join(hooksDir, file), join(HOOKS_DEST, file));
  log("ok", file);
}

// ── Step 2: Copy db ───────────────────────────────────────────────────────────

console.log("\n[2/7] Copying db/ → ~/.claude/hooks/db/");
ensureDir(DB_DEST);
const dbDir = join(PLUGIN_ROOT, "db");
for (const file of readdirSync(dbDir)) {
  copyFileSync(join(dbDir, file), join(DB_DEST, file));
  log("ok", file);
}

// ── Step 3: Copy scripts ──────────────────────────────────────────────────────

console.log("\n[3/7] Copying scripts → ~/.agents/scripts/");
ensureDir(SCRIPTS_DEST);
const scriptsDir = join(PLUGIN_ROOT, "scripts");
for (const file of readdirSync(scriptsDir)) {
  if (file === "install.js") continue; // skip self
  copyFileSync(join(scriptsDir, file), join(SCRIPTS_DEST, file));
  log("ok", file);
}

// ── Step 4: Register hooks in settings.json ───────────────────────────────────

console.log("\n[4/7] Registering hooks in ~/.claude/settings.json");
const settings = loadJson(SETTINGS_PATH) || { hooks: {} };
if (!settings.hooks) settings.hooks = {};

const hooksConfig = JSON.parse(readFileSync(join(hooksDir, "hooks.json"), "utf-8"));

let added = 0, skipped = 0;
for (const h of hooksConfig) {
  const command = `bun ~/.claude/hooks/task-lifecycle/${h.script}`;
  const event = h.event;
  const existing = settings.hooks[event] || [];

  const alreadyRegistered = existing.some(entry =>
    (entry.hooks || []).some(hk => hk.command === command)
  );

  if (alreadyRegistered) {
    log("skip", `${event} → ${h.script} (already registered)`);
    skipped++;
    continue;
  }

  const entry = {
    hooks: [{ type: "command", command, timeout: h.timeout }]
  };
  if (h.matcher) entry.matcher = h.matcher;

  settings.hooks[event] = [...existing, entry];
  log("ok", `${event} → ${h.script}`);
  added++;
}
console.log(`     ${added} added, ${skipped} already present`);

// ── Step 5: Register in enabledPlugins + extraKnownMarketplaces ───────────────

console.log("\n[5/7] Registering plugin in settings.json");

if (!settings.enabledPlugins) settings.enabledPlugins = {};
if (!settings.extraKnownMarketplaces) settings.extraKnownMarketplaces = {};

const pluginKey = "management-ai-helper@management-ai-helper";
if (settings.enabledPlugins[pluginKey]) {
  log("skip", `${pluginKey} already in enabledPlugins`);
} else {
  settings.enabledPlugins[pluginKey] = true;
  log("ok", `enabledPlugins → ${pluginKey}`);
}

if (settings.extraKnownMarketplaces["management-ai-helper"]) {
  log("skip", "management-ai-helper already in extraKnownMarketplaces");
} else {
  settings.extraKnownMarketplaces["management-ai-helper"] = {
    source: { source: "git", url: REPO_URL, ref: REPO_REF }
  };
  log("ok", "extraKnownMarketplaces → management-ai-helper");
}

saveJson(SETTINGS_PATH, settings);

// ── Step 6: Update installed_plugins.json ─────────────────────────────────────

console.log("\n[6/7] Updating installed_plugins.json");
const installed = loadJson(INSTALLED_PLUGINS_PATH) || { version: 2, plugins: {} };

const installPath = SKILLS_CACHE;
const gitSha = (() => {
  try {
    return Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: MARKETPLACE_ROOT }).stdout.toString().trim();
  } catch { return REPO_REF; }
})();

installed.plugins[pluginKey] = [{
  scope: "user",
  installPath,
  version: "1.0.0",
  installedAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  gitCommitSha: gitSha,
}];
saveJson(INSTALLED_PLUGINS_PATH, installed);
log("ok", `registered at ${installPath}`);

// ── Step 7: Sync skills to cache ──────────────────────────────────────────────

console.log("\n[7/7] Syncing skills → plugin cache");
const skillsSrc = join(MARKETPLACE_ROOT, "skills");
const skillsDest = join(SKILLS_CACHE, "skills");
ensureDir(skillsDest);
copyDir(skillsSrc, skillsDest);
log("ok", `${readdirSync(skillsSrc).length} skills synced to ${skillsDest}`);

// ── Done ──────────────────────────────────────────────────────────────────────

console.log(`
╔════════════════════════════════════════════╗
║  Task-Lifecycle v2 installed successfully  ║
║  Restart your Claude Code session to load  ║
║  all hooks and skills.                     ║
╚════════════════════════════════════════════╝
`);
