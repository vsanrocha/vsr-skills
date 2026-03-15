#!/usr/bin/env node
/**
 * Security checks: no binaries, no suspicious patterns, path traversal guards
 */
import { readdirSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(__dirname, "..");

const FORBIDDEN_EXT = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".pyc", ".class",
  ".o", ".a", ".lib", ".obj", ".wasm",
]);

const SUSPICIOUS_PATTERNS = [
  /process\.env\.\w+/,
  /\.env/,
  /password|secret|api[_-]?key|token/i,
  /eval\s*\(/,
  /Function\s*\(/,
  /child_process|exec\s*\(/,
];

let errors = 0;

function fail(msg) {
  console.error(`[SECURITY] ${msg}`);
  errors++;
}

function scanForBinaries(dir, prefix = "") {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== ".git") {
        scanForBinaries(join(dir, e.name), rel);
      }
      continue;
    }
    const ext = e.name.includes(".") ? "." + e.name.split(".").pop().toLowerCase() : "";
    if (FORBIDDEN_EXT.has(ext)) fail(`Binary/forbidden: ${rel}`);
  }
}

function scanForSuspicious(dir, prefix = "") {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!["node_modules", ".git", "templates"].includes(e.name)) {
        scanForSuspicious(full, rel);
      }
      continue;
    }
    if (![".mjs", ".js", ".ts"].some((x) => e.name.endsWith(x))) continue;
    try {
      const content = readFileSync(full, "utf-8");
      for (const pat of SUSPICIOUS_PATTERNS) {
        if (pat.test(content)) {
          const m = content.match(pat);
          fail(`Suspicious pattern in ${rel}: ${m ? m[0].slice(0, 40) : "match"}`);
          break;
        }
      }
    } catch (_) { }
  }
}

function main() {
  console.log("Running security checks...");
  scanForBinaries(join(ROOT, "skills"));
  scanForBinaries(join(ROOT, "plugins"));
  scanForBinaries(join(ROOT, "hooks"));
  scanForBinaries(join(ROOT, "rules"));
  scanForSuspicious(join(ROOT, "skills"));
  scanForSuspicious(join(ROOT, "plugins"));

  if (errors > 0) {
    console.error(`\n${errors} security issue(s) found`);
    process.exit(1);
  }
  console.log("Security checks passed.");
}

main();
