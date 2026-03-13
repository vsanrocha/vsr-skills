#!/usr/bin/env node
/**
 * Build registry: sync plugin symlinks, scan catalog, generate skills.json and plugins.json
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

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

function scanSkills() {
  const skillsDir = join(ROOT, "skills");
  if (!existsSync(skillsDir)) return [];
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const skills = [];
  for (const name of entries) {
    const skillPath = join(skillsDir, name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, "utf-8");
    const fm = extractFrontmatter(content);
    skills.push({
      name: fm?.name || name,
      description: fm?.description || "",
      path: `skills/${name}`,
      targets: ["claude-code", "cursor", "codex", "antigravity"],
    });
  }
  return skills;
}

function scanPlugins() {
  const pluginsDir = join(ROOT, "plugins");
  if (!existsSync(pluginsDir)) return [];
  const entries = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const plugins = [];
  for (const name of entries) {
    const manifestPath = join(pluginsDir, name, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    plugins.push({
      name: manifest.name || name,
      description: manifest.description || "",
      version: manifest.version || "1.0.0",
      path: `plugins/${name}`,
      targets: ["claude-code"],
    });
  }
  return plugins;
}

function main() {
  const skills = scanSkills();
  const plugins = scanPlugins();
  const registryDir = join(ROOT, "registry");

  const skillsOut = join(registryDir, "skills.json");
  const pluginsOut = join(registryDir, "plugins.json");

  mkdirSync(registryDir, { recursive: true });

  writeFileSync(skillsOut, JSON.stringify({ skills }, null, 2));
  writeFileSync(pluginsOut, JSON.stringify({ plugins }, null, 2));

  console.log(`Built registry: ${skills.length} skills, ${plugins.length} plugins`);
}

try {
  execFileSync(process.execPath, [join(__dirname, "sync-symlinks.mjs")], {
    stdio: "inherit",
  });
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
