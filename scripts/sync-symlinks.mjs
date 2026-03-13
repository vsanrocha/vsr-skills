#!/usr/bin/env node
/**
 * Sync symlinks: read plugin.json declarations and create/verify symlinks
 * from plugins/<name>/{skills,hooks}/<item> -> ../../../{skills,hooks}/<item>
 *
 * Convention: canonical files live in the root skills/ and hooks/ directories.
 * Plugins reference them via symlinks declared in .claude-plugin/plugin.json:
 *   { "skills": ["skill-name"], "hooks": ["hook-name"] }
 */
import {
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  lstatSync,
  readlinkSync,
  unlinkSync,
} from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let errors = 0;
let created = 0;

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  errors++;
}

function ensureSymlink(linkPath, targetRelative) {
  const linkDir = dirname(linkPath);

  if (existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink?.()) {
    const stat = lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      const current = readlinkSync(linkPath);
      if (current === targetRelative) return; // already correct
      console.log(`[UPDATE] ${relative(ROOT, linkPath)} -> ${targetRelative}`);
      unlinkSync(linkPath);
    } else {
      fail(
        `${relative(ROOT, linkPath)} exists but is not a symlink — remove it and re-run`
      );
      return;
    }
  }

  mkdirSync(linkDir, { recursive: true });
  symlinkSync(targetRelative, linkPath);
  console.log(`[CREATE] ${relative(ROOT, linkPath)} -> ${targetRelative}`);
  created++;
}

function syncPlugin(pluginName) {
  const pluginDir = join(ROOT, "plugins", pluginName);
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (e) {
    fail(`plugins/${pluginName}: invalid plugin.json — ${e.message}`);
    return;
  }

  for (const skill of manifest.skills ?? []) {
    const source = join(ROOT, "skills", skill);
    if (!existsSync(source)) {
      fail(`plugins/${pluginName}: declared skill '${skill}' not found at skills/${skill}`);
      continue;
    }
    const linkPath = join(pluginDir, "skills", skill);
    ensureSymlink(linkPath, `../../../skills/${skill}`);
  }

  for (const hook of manifest.hooks ?? []) {
    const source = join(ROOT, "hooks", hook);
    if (!existsSync(source)) {
      fail(`plugins/${pluginName}: declared hook '${hook}' not found at hooks/${hook}`);
      continue;
    }
    const linkPath = join(pluginDir, "hooks", hook);
    ensureSymlink(linkPath, `../../../hooks/${hook}`);
  }
}

function main() {
  const pluginsDir = join(ROOT, "plugins");
  if (!existsSync(pluginsDir)) return;

  const plugins = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const name of plugins) syncPlugin(name);

  if (errors > 0) {
    console.error(`\n${errors} error(s) — fix above before continuing`);
    process.exit(1);
  }

  if (created === 0) console.log("Symlinks up to date.");
  else console.log(`${created} symlink(s) created.`);
}

main();
