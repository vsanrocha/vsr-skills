#!/usr/bin/env bun

// PreToolUse hook — matcher: Bash
// Blocks 4 categories of destructive commands before they execute.

const input = JSON.parse(await Bun.stdin.text());
const command = input?.tool_input?.command ?? "";

/**
 * Category 1: rm with force flags targeting dangerous paths
 * Targets: /, ~, $HOME, or .. (relative traversal)
 */
function checkDestructiveRm(cmd) {
  // Must have rm with at least one force/recursive flag
  if (!/\brm\b/.test(cmd)) return null;
  if (!/-[a-zA-Z]*[rf]/.test(cmd)) return null;

  const dangerousTargets = [
    /\s\/(\s|$)/,          // rm -rf /
    /\s~(\s|$)/,           // rm -rf ~
    /\s\$HOME(\s|$)/,      // rm -rf $HOME
    /\s\.\.(\s|$)/,        // rm -rf ..
    /\s\/\*/,              // rm -rf /*
    /\s~\//,               // rm -rf ~/something (broad wipe)
    /\s\$HOME\//,          // rm -rf $HOME/something (broad wipe)
  ];

  for (const pattern of dangerousTargets) {
    if (pattern.test(cmd)) {
      return `Blocked: destructive rm targeting a root or home path. Command: ${cmd.trim()}`;
    }
  }
  return null;
}

/**
 * Category 2: Dangerous SQL statements
 * DROP TABLE, DROP DATABASE, TRUNCATE TABLE, DELETE FROM without WHERE
 */
function checkDangerousSql(cmd) {
  const cmdLower = cmd.toLowerCase();

  if (/\bdrop\s+table\b/.test(cmdLower)) {
    return "Blocked: DROP TABLE detected. This will permanently destroy a table and all its data.";
  }
  if (/\bdrop\s+database\b/.test(cmdLower)) {
    return "Blocked: DROP DATABASE detected. This will permanently destroy the entire database.";
  }
  if (/\btruncate\s+table\b/.test(cmdLower)) {
    return "Blocked: TRUNCATE TABLE detected. This will permanently delete all rows in the table.";
  }
  // DELETE FROM without a WHERE clause
  if (/\bdelete\s+from\b/.test(cmdLower) && !/\bwhere\b/.test(cmdLower)) {
    return "Blocked: DELETE FROM without WHERE detected. This will delete all rows in the table. Add a WHERE clause.";
  }

  return null;
}

/**
 * Category 3: Dangerous git operations
 * git push --force, git push -f, git reset --hard targeting HEAD~ or origin
 */
function checkDangerousGit(cmd) {
  const cmdLower = cmd.toLowerCase();

  if (/\bgit\s+push\b/.test(cmdLower) && /(\s--force\b|\s-f\b)/.test(cmdLower)) {
    return "Blocked: git push --force is dangerous. It rewrites remote history and can destroy teammates' work. Use --force-with-lease if you must force push.";
  }

  if (/\bgit\s+reset\s+--hard\b/.test(cmdLower)) {
    if (/\bhead[~^]/i.test(cmd) || /\borigin\//i.test(cmd)) {
      return "Blocked: git reset --hard targeting HEAD~ or origin is destructive and irreversible. Verify this is intentional.";
    }
  }

  return null;
}

/**
 * Category 4: Reading .env files
 * cat, less, head, tail, more, source, grep, sed, awk on any .env* file
 */
function checkEnvFileRead(cmd) {
  const readers = /\b(cat|less|head|tail|more|source|grep|sed|awk)\b/;
  if (!readers.test(cmd)) return null;

  // Match .env, .env.local, .env.production, etc. (but not .envrc or similar non-secret files)
  if (/\.env(\.[a-zA-Z0-9._-]+)?\b/.test(cmd)) {
    return "Blocked: reading .env files exposes secrets. Access environment variables via process.env instead of reading the file directly.";
  }

  return null;
}

const checks = [
  checkDestructiveRm,
  checkDangerousSql,
  checkDangerousGit,
  checkEnvFileRead,
];

for (const check of checks) {
  const reason = check(command);
  if (reason) {
    console.error(`[dangerous-op-guard] DENIED: ${reason}`);
    console.log(JSON.stringify({ permissionDecision: "deny", reason }));
    process.exit(0);
  }
}

// No dangerous pattern found — allow
console.log(JSON.stringify({}));
