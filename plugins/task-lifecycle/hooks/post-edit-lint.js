#!/usr/bin/env bun

// PostToolUse hook — Write|Edit
// Runs the appropriate linter on the modified file after every edit.
// Blocks the agent if the file has lint errors.

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".php"]);

const MAX_ERROR_LINES = 50;
const TIMEOUT_MS = 120_000;

const input = JSON.parse(await Bun.stdin.text());
const filePath = input.tool_input?.file_path;

if (!filePath) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

const ext = filePath.match(/(\.[^.]+)$/)?.[1]?.toLowerCase();

if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

function getLintCommand(file, extension) {
  if ([".ts", ".tsx", ".js", ".jsx"].includes(extension)) {
    return ["npx", "eslint", "--quiet", file];
  }
  if (extension === ".py") {
    return ["ruff", "check", file];
  }
  if (extension === ".php") {
    return ["./vendor/bin/phpstan", "analyse", file];
  }
  if (extension === ".rs") {
    // cargo check applies to the whole project; run from cwd
    return ["cargo", "check"];
  }
  return null;
}

const cmd = getLintCommand(filePath, ext);
if (!cmd) {
  console.log(JSON.stringify({}));
  process.exit(0);
}

console.error(`[post-edit-lint] Running linter on ${filePath} (${ext})`);

let proc;
try {
  proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: TIMEOUT_MS,
  });
} catch (err) {
  // Linter not installed — skip silently
  console.error(`[post-edit-lint] Linter not available: ${err.message}`);
  console.log(JSON.stringify({}));
  process.exit(0);
}

const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

const combinedOutput = [stdout, stderr].filter(Boolean).join("\n").trim();

if (exitCode === 0) {
  console.error(`[post-edit-lint] No lint errors in ${filePath}`);
  console.log(JSON.stringify({}));
  process.exit(0);
}

// ESLint missing config — not a lint error, skip
if (combinedOutput.includes("couldn't find an eslint.config") || combinedOutput.includes("No ESLint configuration")) {
  console.error(`[post-edit-lint] No ESLint config found — skipping`);
  console.log(JSON.stringify({}));
  process.exit(0);
}

// Lint failed — block and report errors
const lines = combinedOutput.split("\n");
const truncated = lines.length > MAX_ERROR_LINES;
const displayLines = truncated ? lines.slice(0, MAX_ERROR_LINES) : lines;
const errorText = displayLines.join("\n") + (truncated ? `\n... (${lines.length - MAX_ERROR_LINES} more lines omitted)` : "");

console.error(`[post-edit-lint] Lint failed (exit ${exitCode}) — blocking`);

console.log(
  JSON.stringify({
    decision: "block",
    reason: `Lint errors in ${filePath}:\n\n${errorText}`,
  })
);
