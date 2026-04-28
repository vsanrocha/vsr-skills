#!/usr/bin/env bun

// Stop hook: Task Completion Verification Gate
// Runs type-check + linter + tests before allowing agent to finish.
// If stop_hook_active is true (retry after block), lets through to prevent infinite loop.

import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const MAX_OUTPUT_LINES = 30;
const cwd = process.cwd();

function truncate(text, maxLines) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (truncated ${lines.length - maxLines} more lines)`
  );
}

function fileExists(name) {
  return existsSync(join(cwd, name));
}

function detectProjectTypes() {
  const types = [];
  if (fileExists("package.json")) types.push("node");
  if (fileExists("composer.json")) types.push("php");
  if (fileExists("pyproject.toml")) types.push("python");
  if (fileExists("Cargo.toml")) types.push("rust");
  if (fileExists("go.mod")) types.push("go");
  return types;
}

function shouldSkipNpmTest() {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
    const testScript = pkg.scripts?.test;
    if (!testScript) return true;
    return testScript.includes("no test specified");
  } catch {
    return true;
  }
}

function hasTsConfig() {
  return fileExists("tsconfig.json");
}

function hasEslintConfig() {
  return (
    fileExists(".eslintrc") ||
    fileExists(".eslintrc.js") ||
    fileExists(".eslintrc.cjs") ||
    fileExists(".eslintrc.json") ||
    fileExists(".eslintrc.yml") ||
    fileExists("eslint.config.js") ||
    fileExists("eslint.config.mjs") ||
    fileExists("eslint.config.cjs") ||
    fileExists("eslint.config.ts")
  );
}

async function runCommand(cmd, args) {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;
    return { exitCode, output: (stdout + "\n" + stderr).trim() };
  } catch (err) {
    return { exitCode: 1, output: err.message };
  }
}

function getChecks(projectType) {
  const checks = [];

  switch (projectType) {
    case "node": {
      if (hasTsConfig()) {
        checks.push({
          name: "TypeCheck (tsc)",
          cmd: "npx",
          args: ["tsc", "--noEmit"],
        });
      }
      if (hasEslintConfig()) {
        checks.push({
          name: "Linter (eslint)",
          cmd: "npx",
          args: ["eslint", ".", "--quiet"],
        });
      }
      if (!shouldSkipNpmTest()) {
        checks.push({
          name: "Tests (npm test)",
          cmd: "npm",
          args: ["test"],
        });
      }
      break;
    }
    case "php": {
      if (fileExists("vendor/bin/phpstan")) {
        checks.push({
          name: "TypeCheck (phpstan)",
          cmd: "./vendor/bin/phpstan",
          args: ["analyse"],
        });
      }
      if (fileExists("vendor/bin/phpcs")) {
        checks.push({
          name: "Linter (phpcs)",
          cmd: "./vendor/bin/phpcs",
          args: [],
        });
      }
      checks.push({
        name: "Tests (composer test)",
        cmd: "composer",
        args: ["test"],
      });
      break;
    }
    case "python": {
      checks.push({
        name: "TypeCheck (mypy)",
        cmd: "mypy",
        args: ["."],
      });
      checks.push({
        name: "Linter (ruff)",
        cmd: "ruff",
        args: ["check", "."],
      });
      checks.push({
        name: "Tests (pytest)",
        cmd: "pytest",
        args: ["--tb=short", "-q"],
      });
      break;
    }
    case "rust": {
      checks.push({
        name: "TypeCheck (cargo check)",
        cmd: "cargo",
        args: ["check"],
      });
      checks.push({
        name: "Tests (cargo test)",
        cmd: "cargo",
        args: ["test"],
      });
      break;
    }
    case "go": {
      checks.push({
        name: "TypeCheck (go vet)",
        cmd: "go",
        args: ["vet", "./..."],
      });
      checks.push({
        name: "Tests (go test)",
        cmd: "go",
        args: ["test", "./..."],
      });
      break;
    }
  }

  return checks;
}

async function main() {
  const input = JSON.parse(await Bun.stdin.text());

  // Infinite loop protection: if this is a retry after a previous block, let through
  if (input.stop_hook_active) {
    console.error("[stop-verify] stop_hook_active=true, allowing through to prevent infinite loop");
    console.log(JSON.stringify({}));
    return;
  }

  const sessionId = input.session_id || "default";
  const dirtyFlag = `/tmp/stop-verify-dirty-${sessionId}`;

  if (!existsSync(dirtyFlag)) {
    console.error("[stop-verify] No file edits this turn, skipping checks");
    console.log(JSON.stringify({}));
    return;
  }

  // Clear flag before running checks
  unlinkSync(dirtyFlag);

  const projectTypes = detectProjectTypes();

  if (projectTypes.length === 0) {
    console.error("[stop-verify] No recognized project type detected, allowing through");
    console.log(JSON.stringify({}));
    return;
  }

  console.error(`[stop-verify] Detected project types: ${projectTypes.join(", ")}`);

  const allChecks = projectTypes.flatMap(getChecks);

  if (allChecks.length === 0) {
    console.error("[stop-verify] No verification checks available, allowing through");
    console.log(JSON.stringify({}));
    return;
  }

  console.error(`[stop-verify] Running ${allChecks.length} verification checks...`);

  const failures = [];

  for (const check of allChecks) {
    console.error(`[stop-verify]   Running: ${check.name}...`);
    const result = await runCommand(check.cmd, check.args);

    if (result.exitCode !== 0) {
      console.error(`[stop-verify]   FAILED: ${check.name} (exit ${result.exitCode})`);
      failures.push({
        name: check.name,
        output: truncate(result.output, MAX_OUTPUT_LINES),
      });
    } else {
      console.error(`[stop-verify]   PASSED: ${check.name}`);
    }
  }

  if (failures.length > 0) {
    const errorReport = failures
      .map((f) => `### ${f.name}\n${f.output}`)
      .join("\n\n");

    const reason =
      `Verification failed (${failures.length}/${allChecks.length} checks).\n` +
      `Fix the following issues before completing the task:\n\n${errorReport}`;

    console.error(`[stop-verify] BLOCKED: ${failures.length} check(s) failed`);
    console.log(JSON.stringify({ decision: "block", reason }));
    return;
  }

  console.error(`[stop-verify] All ${allChecks.length} checks passed`);
  console.log(JSON.stringify({}));
}

main().catch((err) => {
  console.error(`[stop-verify] Fatal error: ${err.message}`);
  // On unexpected error, don't block the agent
  console.log(JSON.stringify({}));
});
