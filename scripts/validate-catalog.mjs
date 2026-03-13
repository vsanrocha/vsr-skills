#!/usr/bin/env node
/**
 * Validate catalog: required files, frontmatter, plugin manifests, no binaries
 */
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const FORBIDDEN_EXT = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".pyc", ".class",
  ".o", ".a", ".lib", ".obj", ".wasm",
]);

let errors = 0;

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  errors++;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const yaml = match[1];
  const result = {};
  for (const line of yaml.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return result;
}

function validateSkills() {
  const skillsDir = join(ROOT, "skills");
  if (!existsSync(skillsDir)) return;
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const d of entries) {
    const skillPath = join(skillsDir, d.name, "SKILL.md");
    if (!existsSync(skillPath)) {
      fail(`skills/${d.name}: missing SKILL.md`);
      continue;
    }
    const content = readFileSync(skillPath, "utf-8");
    const fm = extractFrontmatter(content);
    if (!fm?.name) fail(`skills/${d.name}/SKILL.md: missing frontmatter 'name'`);
    if (!fm?.description) fail(`skills/${d.name}/SKILL.md: missing frontmatter 'description'`);
  }
}

function validatePlugins() {
  const pluginsDir = join(ROOT, "plugins");
  if (!existsSync(pluginsDir)) return;
  const entries = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const d of entries) {
    const base = join(pluginsDir, d.name);
    const manifestPath = join(base, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      fail(`plugins/${d.name}: missing .claude-plugin/plugin.json`);
      continue;
    }
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      if (!manifest.name) fail(`plugins/${d.name}: plugin.json missing 'name'`);
      if (!manifest.description) fail(`plugins/${d.name}: plugin.json missing 'description'`);
    } catch (e) {
      fail(`plugins/${d.name}: invalid plugin.json - ${e.message}`);
    }
    const readmePath = join(base, "README.md");
    if (!existsSync(readmePath)) fail(`plugins/${d.name}: missing README.md`);
  }
}

function validateNoBinaries(dir, prefix = "") {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      validateNoBinaries(full, rel);
      continue;
    }
    const ext = e.name.includes(".") ? "." + e.name.split(".").pop().toLowerCase() : "";
    if (FORBIDDEN_EXT.has(ext)) fail(`Binary/forbidden file: ${rel}`);
    if (statSync(full).size > 5 * 1024 * 1024 && !e.name.endsWith(".md")) {
      fail(`Large non-doc file (possible binary): ${rel}`);
    }
  }
}

function validateRoot() {
  const required = ["README.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md"];
  for (const f of required) {
    if (!existsSync(join(ROOT, f))) fail(`Missing ${f}`);
  }
  const pluginManifest = join(ROOT, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginManifest)) fail("Missing .claude-plugin/plugin.json");
  try {
    const m = JSON.parse(readFileSync(pluginManifest, "utf-8"));
    if (!m.name || !m.description) fail(".claude-plugin/plugin.json missing name/description");
  } catch (e) {
    fail(`Invalid .claude-plugin/plugin.json: ${e.message}`);
  }
}

function main() {
  console.log("Validating catalog...");
  validateRoot();
  validateSkills();
  validatePlugins();
  validateNoBinaries(join(ROOT, "skills"), "skills");
  validateNoBinaries(join(ROOT, "plugins"), "plugins");
  validateNoBinaries(join(ROOT, "hooks"), "hooks");
  validateNoBinaries(join(ROOT, "rules"), "rules");

  if (errors > 0) {
    console.error(`\n${errors} validation error(s)`);
    process.exit(1);
  }
  console.log("Validation passed.");
}

main();
